import { Router } from "express";

import { asyncHandler } from "../../shared/http/async-handler.js";
import { requireCsrfToken } from "../../shared/middleware/csrf.js";
import { PERMISSION_CODES } from "../authorization/authorization.constants.js";
import { requirePermission } from "../authorization/authorization.middleware.js";
import { configureProductOptions } from "./product-options.service.js";
import { productIdParamsSchema } from "./product-options.validation.js";

export const productOptionsAdminRouter = Router();

productOptionsAdminRouter.put(
  "/:productId/options",
  requirePermission(PERMISSION_CODES.CATALOG_WRITE),
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const { productId } = productIdParamsSchema.parse(req.params);
    const product = await configureProductOptions(productId, req.body);
    res.status(200).json({ product });
  }),
);
