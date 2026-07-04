import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getEventMetadata, upsertEventMetadata, getSpaceById, createAuditLog } from "../services/db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { userCanAccessSpace, isAdminUser } from "../utils/rbac.js";
import { notifyActivity } from "../services/notifications.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Validation
//
// The googleDocUrl is later rendered as an <a href> in the frontend. React
// does NOT block javascript:/data: URLs in href, so an unvalidated value would
// allow stored XSS. Restrict it to http(s) here (empty string clears it).
// ---------------------------------------------------------------------------

const AgendaItemSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(2000),
  responsible: z.string().max(200).optional(),
  completed: z.boolean(),
});

const EventMetadataUpdateSchema = z
  .object({
    googleDocUrl: z
      .string()
      .max(2048)
      .refine(
        (v) => v === "" || /^https?:\/\//i.test(v),
        "googleDocUrl must be an http(s) URL",
      )
      .optional(),
    agendaItems: z.array(AgendaItemSchema).max(200).optional(),
  })
  .strict();

function zodError(res: Response, err: z.ZodError): void {
  res.status(400).json({
    error: "Validation failed",
    code: "INVALID_PAYLOAD",
    details: err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
  });
}

// All event metadata routes require session auth
router.use(requireAuth);

/**
 * Get metadata for a specific event.
 * Returns defaults if no record exists yet.
 */
router.get(
    "/:spaceId/:eventId",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const spaceId = req.params.spaceId as string;
        const eventId = req.params.eventId as string;
        const user = req.session.user!;

        const space = await getSpaceById(spaceId);
        if (!space) {
            res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
            return;
        }

        // Auth check: user must be able to access the space
        if (
            !userCanAccessSpace(
                user.groups,
                space.keycloakGroup,
                isAdminUser(user.groups),
            )
        ) {
            res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
            return;
        }

        const metadata = await getEventMetadata(eventId);

        if (!metadata) {
            // Return empty defaults if not found
            res.json({
                id: eventId,
                spaceId,
                googleDocUrl: undefined,
                agendaItems: [],
            });
        } else {
            res.json(metadata);
        }
    }),
);

/**
 * Update metadata for an event.
 */
router.post(
    "/:spaceId/:eventId",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const spaceId = req.params.spaceId as string;
        const eventId = req.params.eventId as string;
        const user = req.session.user!;

        const parsed = EventMetadataUpdateSchema.safeParse(req.body);
        if (!parsed.success) { zodError(res, parsed.error); return; }
        const payload = parsed.data;

        const space = await getSpaceById(spaceId);
        if (!space) {
            res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
            return;
        }

        // Auth check
        if (
            !userCanAccessSpace(
                user.groups,
                space.keycloakGroup,
                isAdminUser(user.groups),
            )
        ) {
            res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
            return;
        }

        // Fetch existing metadata for comparison
        const existing = await getEventMetadata(eventId);
        const updated = await upsertEventMetadata(eventId, spaceId, payload);

        // Audit Logging
        let action = "UPDATE_EVENT_AGENDA";
        if (payload.googleDocUrl !== undefined) {
            action = "UPDATE_EVENT_DOC";
        } else if (payload.agendaItems !== undefined && existing) {
            if (payload.agendaItems.length < existing.agendaItems.length) {
                action = "DELETE_EVENT_AGENDA";
            } else if (payload.agendaItems.length > existing.agendaItems.length) {
                action = "CREATE_EVENT_AGENDA";
            }
        }

        await createAuditLog({
            userId: user.sub,
            userName: user.name,
            action,
            entityType: "EVENT",
            entityId: eventId,
            details: JSON.stringify({
                spaceId,
                updates: payload
            })
        });

        // Only notify when a meeting document is linked/changed — the "pack is
        // ready" signal. Agenda-item ticks are too noisy to email on.
        if (action === "UPDATE_EVENT_DOC" && payload.googleDocUrl) {
            void notifyActivity({
                spaceId: space.id,
                spaceName: space.name,
                type: "EVENT_UPDATED",
                title: "Meeting document linked",
                link: `/spaces/${space.id}/events/${eventId}`,
                entityId: eventId,
                actorName: user.name,
                actorUserId: user.sub,
            });
        }

        res.json(updated);
    }),
);

export default router;
