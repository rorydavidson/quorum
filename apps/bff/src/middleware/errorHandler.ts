import type { Request, Response, NextFunction } from "express";
import { reqLog } from "../services/logger.js";

export interface AppError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

/**
 * Global Express error handler. Always responds with the standard
 * `{ error, code }` shape.
 *
 * 4xx errors keep their message: they come from body parsing, validation or
 * explicit rejections and describe what the client did wrong. 5xx errors are
 * replaced with a generic message because at that point `err.message` is
 * whatever Knex, Google or a third-party library threw, and that text can
 * expose table names, SQL fragments or internal hostnames to the browser.
 * The full error is still written to the server log with the request id.
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status || err.statusCode || 500;
  reqLog(req).error({ err, status, code: err.code }, "Unhandled request error");

  if (res.headersSent) {
    // A handler already streamed part of a response; nothing sensible left
    // to send. Express will close the connection.
    return;
  }

  const isServerError = status >= 500;
  res.status(status).json({
    error: isServerError ? "Internal Server Error" : err.message || "Bad Request",
    code: err.code || (isServerError ? "INTERNAL_ERROR" : "BAD_REQUEST"),
  });
}
