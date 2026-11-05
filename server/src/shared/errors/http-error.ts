import type { ApplicationErrorCode } from "./error-codes.js";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
    public readonly code?: ApplicationErrorCode,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
