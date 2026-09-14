import type { Request } from "express";

import { HttpError } from "../../shared/errors/http-error.js";
import { asyncHandler } from "../../shared/http/async-handler.js";
import type { PermissionCode } from "./authorization.constants.js";
import { assertAdminAccess, assertPermission, getAuthorizationContext } from "./authorization.service.js";

async function loadAuthorization(req: Request) {
  const sessionUser = req.session.user;

  if (!sessionUser) {
    throw new HttpError(401, "Authentication required.");
  }

  return getAuthorizationContext(sessionUser.id);
}

export const requireAdminAccess = asyncHandler(async (req, res, next) => {
  const authorization = await loadAuthorization(req);

  assertAdminAccess(authorization);
  res.locals.authorization = authorization;
  next();
});

export function requirePermission(requiredPermission: PermissionCode) {
  return asyncHandler(async (req, res, next) => {
    const authorization = await loadAuthorization(req);

    assertPermission(authorization, requiredPermission);
    res.locals.authorization = authorization;
    next();
  });
}
