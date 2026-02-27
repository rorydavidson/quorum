import { Router, type IRouter, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getEventMetadata, upsertEventMetadata, getSpaceById } from "../services/db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { userCanAccessSpace, isAdminUser } from "./documents.js";

const router: IRouter = Router();

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
        const payload = req.body;

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

        const updated = await upsertEventMetadata(eventId, spaceId, payload);
        res.json(updated);
    }),
);

export default router;
