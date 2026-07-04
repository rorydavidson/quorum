import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getSpaceById,
  getUserSubscriptions,
  subscribeToSpace,
  unsubscribeFromSpace,
} from "../services/db.js";
import { isAdminUser, userCanAccessSpace } from "../utils/rbac.js";

const router: IRouter = Router();

router.use(requireAuth);

// GET /notifications/subscriptions — the caller's subscribed space IDs
router.get(
  "/subscriptions",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.session.user!;
    const subs = await getUserSubscriptions(user.sub);
    res.json({ subscriptions: subs });
  }),
);

// POST /notifications/subscriptions/:spaceId — subscribe to a space
router.post(
  "/subscriptions/:spaceId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.session.user!;
    const space = await getSpaceById(String(req.params.spaceId));

    if (!space) {
      res.status(404).json({ error: "Space not found", code: "SPACE_NOT_FOUND" });
      return;
    }
    if (!userCanAccessSpace(user.groups, space.keycloakGroup, isAdminUser(user.groups))) {
      res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
      return;
    }
    if (!user.email) {
      res.status(400).json({
        error: "No email address on your account to notify",
        code: "NO_EMAIL",
      });
      return;
    }

    await subscribeToSpace(user.sub, space.id, user.email);
    res.status(201).json({ spaceId: space.id, email: user.email });
  }),
);

// DELETE /notifications/subscriptions/:spaceId — unsubscribe
router.delete(
  "/subscriptions/:spaceId",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.session.user!;
    await unsubscribeFromSpace(user.sub, String(req.params.spaceId));
    res.status(204).end();
  }),
);

export default router;
