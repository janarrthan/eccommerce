import { Router } from "express";

import { asyncHandler } from "../../shared/http/async-handler.js";
import { storefrontCurrencyQuerySchema } from "../pricing/pricing.validation.js";
import { getProductBySlug, listProducts, resolveProductVariant } from "./products.service.js";
import { resolveVariantQuerySchema } from "./product-options.validation.js";
import { listProductsQuerySchema, productSlugParamsSchema } from "./products.validation.js";

export const productsRouter = Router();

productsRouter.get(
  "/:productSlug/variant",
  asyncHandler(async (req, res) => {
    const { productSlug } = productSlugParamsSchema.parse(req.params);
    const { optionValueIds, currency } = resolveVariantQuerySchema.parse(req.query);
    const result = await resolveProductVariant(productSlug, optionValueIds, currency);
    res.status(200).json(result);
  }),
);

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listProductsQuerySchema.parse(req.query);
    const products = await listProducts(query);

    res.status(200).json({ products });
  }),
);

productsRouter.get(
  "/:productSlug",
  asyncHandler(async (req, res) => {
    const { productSlug } = productSlugParamsSchema.parse(req.params);
    const { currency } = storefrontCurrencyQuerySchema.parse(req.query);
    const product = await getProductBySlug(productSlug, currency);

    res.status(200).json({ product });
  }),
);
