import { Router } from "express";

import { asyncHandler } from "../../shared/http/async-handler.js";
import { requireAuthenticated } from "../../shared/middleware/authenticated.js";
import { getOrCreateCsrfToken, requireCsrfToken } from "../../shared/middleware/csrf.js";
import { SESSION_COOKIE_NAME } from "../../shared/middleware/session.js";
import { getCurrentUser, loginUser, registerCustomer } from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.validation.js";
import { establishAuthenticatedSession } from "./auth.session.js";

export const authRouter = Router();

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.session.user) {
      res.status(200).json({ user: null });
      return;
    }

    const user = await getCurrentUser(req.session.user.id);
    res.status(200).json({ user });
  }),
);

authRouter.get("/csrf-token", requireAuthenticated, (req, res) => {
  res.status(200).json({ csrfToken: getOrCreateCsrfToken(req) });
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const user = await registerCustomer(input);

    await establishAuthenticatedSession(req, {
      id: user.id,
      email: user.email,
    });

    res.status(201).json({ user });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await loginUser(input);

    await establishAuthenticatedSession(req, {
      id: user.id,
      email: user.email,
    });

    res.status(200).json({ user });
  }),
);

authRouter.post(
  "/logout",
  requireAuthenticated,
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(204).send();
  }),
);
