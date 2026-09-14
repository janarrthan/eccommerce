import { z } from "zod";

import { currencyCodeSchema } from "../pricing/pricing.validation.js";

export const listProductsQuerySchema = z
  .object({
    category: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
    currency: currencyCodeSchema.optional(),
  })
  .strict();

export const productSlugParamsSchema = z.object({
  productSlug: z.string().trim().min(1, "Product slug is required."),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ProductSlugParams = z.infer<typeof productSlugParamsSchema>;
