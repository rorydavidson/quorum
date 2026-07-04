import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recordPageView } from "../services/db.js";

const router: IRouter = Router();

router.use(requireAuth);

// Only record in-portal paths; ignore anything that doesn't look like one.
const ViewSchema = z.object({
  path: z.string().min(1).max(512).startsWith("/"),
});

/** Derive the space id from a portal path like /spaces/board/documents. */
function spaceIdFromPath(path: string): string | undefined {
  const m = /^\/spaces\/([^/?#]+)/.exec(path);
  return m ? decodeURIComponent(m[1]) : undefined;
}

// POST /metrics/view — record a page view for the current user (fire-and-forget).
router.post(
  "/view",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parsed = ViewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid path", code: "INVALID_PATH" });
      return;
    }
    const user = req.session.user!;
    // Strip query/hash before storing so paths aggregate cleanly.
    const path = parsed.data.path.split(/[?#]/)[0];

    await recordPageView({
      userId: user.sub,
      userName: user.name,
      path,
      spaceId: spaceIdFromPath(path),
    });

    res.status(204).end();
  }),
);

export default router;
