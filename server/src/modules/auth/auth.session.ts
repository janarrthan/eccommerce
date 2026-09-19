import type { Request } from "express";
import type { SessionData } from "express-session";

import { getOrCreateCsrfToken } from "../../shared/middleware/csrf.js";

type AuthenticatedSessionUser = NonNullable<SessionData["user"]>;

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function destroySession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function establishAuthenticatedSession(req: Request, user: AuthenticatedSessionUser) {
  await regenerateSession(req);

  try {
    req.session.user = user;
    getOrCreateCsrfToken(req);
    await saveSession(req);
  } catch (error) {
    delete req.session.user;
    delete req.session.csrfToken;

    try {
      await destroySession(req);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Failed to persist and clean up the authenticated session.");
    }

    throw error;
  }
}
