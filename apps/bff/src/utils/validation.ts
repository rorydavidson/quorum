import type { Response } from "express";
import { z } from "zod";

/** Sends a Zod validation failure as a structured 400 response. */
export function zodError(res: Response, err: z.ZodError): void {
  res.status(400).json({
    error: "Validation failed",
    code: "INVALID_PAYLOAD",
    details: err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
  });
}

/**
 * A URL that will be rendered as an <a href> in the frontend. React does not
 * block javascript:/data: URLs in href, so anything stored must be http(s).
 * The empty string is allowed so a client can clear the value.
 */
export const HttpUrlOrEmptySchema = z
  .string()
  .max(2048)
  .refine(
    (v) => v === "" || /^https?:\/\//i.test(v),
    "must be an http(s) URL",
  );

export const AgendaItemSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(2000),
  responsible: z.string().max(200).optional(),
  completed: z.boolean(),
});
