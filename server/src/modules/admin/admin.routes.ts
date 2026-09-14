import { Router } from "express";

import { requireAdminAccess } from "../authorization/authorization.middleware.js";
import { productOptionsAdminRouter } from "../products/product-options.admin.routes.js";
import { productVariantImagesAdminRouter } from "../products/product-variant-images.admin.routes.js";
import { pricingAdminRouter } from "../pricing/pricing.admin.routes.js";

export const adminRouter = Router();

adminRouter.use("/products", productOptionsAdminRouter);
adminRouter.use("/products", productVariantImagesAdminRouter);
adminRouter.use("/pricing", pricingAdminRouter);

adminRouter.get("/context", requireAdminAccess, (_req, res) => {
  const authorization = res.locals.authorization;

  res.status(200).json({
    authorization: {
      roles: authorization.roleCodes,
      permissions: authorization.permissionCodes,
    },
  });
});
