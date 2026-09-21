import type { Request, RequestHandler } from "express";

import { HttpError } from "../errors/http-error.js";

export function getAuthenticatedUserId(req: Request) {
  const userId = req.session.user?.id;

  if (!userId) {
    throw new HttpError(401, "Authentication required.");
  }

  return userId;
}

export const requireAuthenticated: RequestHandler = (req, _res, next) => {
  try {
    getAuthenticatedUserId(req);
  } catch (error) {
    next(error);
    return;
  }

  next();
};
