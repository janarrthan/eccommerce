import connectPgSimple from "connect-pg-simple";
import session from "express-session";

import { env } from "../config/env.js";

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const DEVELOPMENT_SESSION_SECRET = "development-session-secret-change-before-production";

export const SESSION_COOKIE_NAME = "eccommerce.sid";

const PgSessionStore = connectPgSimple(session);

function getSessionSecret() {
  return env.SESSION_SECRET ?? DEVELOPMENT_SESSION_SECRET;
}

function createSessionStore() {
  if (env.NODE_ENV === "test") {
    return new session.MemoryStore();
  }

  return new PgSessionStore({
    conString: env.DATABASE_URL,
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 30,
  });
}

export function createSessionMiddleware() {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(),
    cookie: {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_MS,
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      secure: env.NODE_ENV === "production",
    },
  });
}
