import { z } from "zod";

import { storefrontCurrencyQuerySchema } from "../pricing/pricing.validation.js";

export const cartQuerySchema = storefrontCurrencyQuerySchema;

export const cartItemParamsSchema = z
  .object({
    variantId: z.string().trim().min(1, "Variant ID is required.").max(100),
  })
  .strict();

export const cartItemQuantityInputSchema = z
  .object({
    quantity: z.number().int().positive(),
  })
  .strict();

export type CartQuery = z.infer<typeof cartQuerySchema>;
export type CartItemParams = z.infer<typeof cartItemParamsSchema>;
export type CartItemQuantityInput = z.infer<typeof cartItemQuantityInputSchema>;
