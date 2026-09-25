import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getEventMetadata, upsertEventMetadata, getSpaceById, createAuditLog } from "../services/db.js";
import { EventSpaceMismatchError } from "../services/errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { userCanAccessSpace, userCanUpload, isAdminUser } from "../utils/rbac.js";
import { AgendaItemSchema, HttpUrlOrEmptySchema, zodError } from "../utils/validation.js";
import { notifyActivity } from "../services/notifications.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EventMetadataUpdateSchema = z
  .object({
    googleDocUrl: HttpUrlOrEmptySchema.optional(),
    agendaItems: z.array(AgendaItemSchema).max(200).optional(),
  })
  .strict();

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

        const metadata = await getEventMetadata(eventId, spaceId);

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
 *
 * Writing is restricted to the space's upload groups (and admins), matching
 * the rule for documents: reading a space does not imply editing its agendas.
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

        const admin = isAdminUser(user.groups);

        if (!userCanAccessSpace(user.groups, space.keycloakGroup, admin)) {
            res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
            return;
        }

        if (!userCanUpload(user.groups, space.uploadGroups, admin)) {
            res.status(403).json({
                error: "You do not have permission to edit events in this space",
                code: "FORBIDDEN",
            });
            return;
        }

        // Fetch existing metadata for comparison
        const existing = await getEventMetadata(eventId, spaceId);

        let updated;
        try {
            updated = await upsertEventMetadata(eventId, spaceId, payload);
        } catch (err) {
            if (err instanceof EventSpaceMismatchError) {
                res.status(409).json({
                    error: "This event belongs to a different space",
                    code: "EVENT_SPACE_CONFLICT",
                });
                return;
            }
            throw err;
        }

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
