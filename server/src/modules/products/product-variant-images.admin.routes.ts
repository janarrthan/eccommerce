import { Router } from "express";

import { asyncHandler } from "../../shared/http/async-handler.js";
import { requireCsrfToken } from "../../shared/middleware/csrf.js";
import { PERMISSION_CODES } from "../authorization/authorization.constants.js";
import { requirePermission } from "../authorization/authorization.middleware.js";
import { productIdParamsSchema } from "./product-options.validation.js";
import { configureProductVariantImages, getProductVariantImageAssignments } from "./product-variant-images.service.js";

export const productVariantImagesAdminRouter = Router();

// Return the image library and explicit links needed by the future admin editor.
productVariantImagesAdminRouter.get(
  "/:productId/variant-images",
  requirePermission(PERMISSION_CODES.CATALOG_READ),
  asyncHandler(async (req, res) => {
    const { productId } = productIdParamsSchema.parse(req.params);
    const product = await getProductVariantImageAssignments(productId);
    res.status(200).json({ product });
  }),
);

// Replace ordered links only for variants included in this request.
productVariantImagesAdminRouter.put(
  "/:productId/variant-images",
  requirePermission(PERMISSION_CODES.CATALOG_WRITE),
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const { productId } = productIdParamsSchema.parse(req.params);
    const product = await configureProductVariantImages(productId, req.body);
    res.status(200).json({ product });
  }),
);
