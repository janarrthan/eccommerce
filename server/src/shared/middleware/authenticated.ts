import type { RequestHandler } from "express";

import { HttpError } from "../errors/http-error.js";

export const requireAuthenticated: RequestHandler = (req, _res, next) => {
  if (!req.session.user) {
    next(new HttpError(401, "Authentication required."));
    return;
  }

  next();
};
