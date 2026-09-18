import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";

import { HttpError } from "../errors/http-error.js";

export const CSRF_HEADER_NAME = "x-csrf-token";

export function getOrCreateCsrfToken(req: Request) {
  req.session.csrfToken ??= randomBytes(32).toString("base64url");

  return req.session.csrfToken;
}

function tokensMatch(token: string, expectedToken: string) {
  const tokenBuffer = Buffer.from(token, "utf8");
  const expectedTokenBuffer = Buffer.from(expectedToken, "utf8");

  if (tokenBuffer.length !== expectedTokenBuffer.length) {
    return false;
  }

  return timingSafeEqual(tokenBuffer, expectedTokenBuffer);
}

export const requireCsrfToken: RequestHandler = (req, _res, next) => {
  const expectedToken = req.session.csrfToken;
  const submittedToken = req.get(CSRF_HEADER_NAME);

  if (!expectedToken || !submittedToken || !tokensMatch(submittedToken, expectedToken)) {
    next(new HttpError(403, "Invalid CSRF token."));
    return;
  }

  next();
};
