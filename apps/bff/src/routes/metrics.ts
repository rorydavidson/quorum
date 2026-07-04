import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recordPageView } from "../services/db.js";

const router: IRouter = Router();

/**
 * Opaque, irreversible per-user token used only for distinct-user counting.
 * HMAC of the user id with the server session secret — stable (so unique
 * counts hold across days) but unlinkable to the person without the secret,
 * and no name is ever stored.
 */
function visitorHash(userSub: string): string {
  const secret = process.env.SESSION_SECRET ?? "quorum-analytics";
  return crypto.createHmac("sha256", secret).update(userSub).digest("hex");
}

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
      path,
      spaceId: spaceIdFromPath(path),
      visitorHash: visitorHash(user.sub),
    });

    res.status(204).end();
  }),
);

export default router;
