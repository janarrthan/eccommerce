import cors from "cors";
import express from "express";

import { env } from "./shared/config/env.js";
import { createSessionMiddleware } from "./shared/middleware/session.js";
import { errorHandler } from "./shared/http/error-handler.js";
import { healthRouter } from "./shared/http/health.routes.js";
import { notFoundHandler } from "./shared/http/not-found.js";
import { readinessRouter } from "./shared/http/readiness.routes.js";

import { adminRouter } from "./modules/admin/admin.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { cartRouter } from "./modules/cart/cart.routes.js";
import { pricingRouter } from "./modules/pricing/pricing.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  if (env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
  }

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(createSessionMiddleware());
  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter);
  app.use("/api/health", healthRouter);
  app.use("/ready", readinessRouter);
  app.use("/api/ready", readinessRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/storefront/cart", cartRouter);
  app.use("/api/storefront/pricing", pricingRouter);
  app.use("/api/storefront/products", productsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
