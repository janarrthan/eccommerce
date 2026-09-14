import { z } from "zod";

import { currencyCodeSchema, variantPriceInputSchema } from "../pricing/pricing.validation.js";

const labelSchema = z.string().trim().min(1).max(100);
const idSchema = z.string().trim().min(1).max(128);
const skuSchema = z.string().trim().min(1).max(128);
const prismaIntSchema = z.number().int().min(0).max(2_147_483_647);

const variantPricesSchema = z
  .array(variantPriceInputSchema)
  .min(1)
  .max(50)
  .superRefine((prices, ctx) => {
    const currencies = prices.map(({ currency }) => currency);
    if (new Set(currencies).size !== currencies.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each variant price currency may appear only once.",
      });
    }
  });

const selectionSchema = z
  .object({
    option: labelSchema,
    value: labelSchema,
  })
  .strict();

const variantFields = {
  name: labelSchema,
  sku: skuSchema,
  prices: variantPricesSchema,
  stock: prismaIntSchema,
};

const newVariantSchema = z
  .object({
    id: z.undefined().optional(),
    ...variantFields,
    selections: z.array(selectionSchema).max(20),
  })
  .strict();

const existingVariantSchema = z
  .object({
    id: idSchema,
    name: variantFields.name.optional(),
    sku: variantFields.sku.optional(),
    prices: variantFields.prices.optional(),
    stock: variantFields.stock.optional(),
    selections: z.array(selectionSchema).max(20),
  })
  .strict();

export const productIdParamsSchema = z.object({ productId: idSchema });

export const productOptionsInputSchema = z
  .object({
    options: z
      .array(
        z
          .object({
            id: idSchema.optional(),
            name: labelSchema,
            values: z
              .array(
                z
                  .object({
                    id: idSchema.optional(),
                    value: labelSchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .max(20),
    variants: z.array(z.union([existingVariantSchema, newVariantSchema])).max(1000),
  })
  .strict();

export const resolveVariantQuerySchema = z
  .object({
    optionValueIds: z.preprocess(
      (value) => (typeof value === "string" ? [value] : value),
      z.array(idSchema).max(20).default([]),
    ),
    currency: currencyCodeSchema.optional(),
  })
  .strict();

export type ProductOptionsInput = z.infer<typeof productOptionsInputSchema>;

// To visualize the structure of the input, consider the following example:

//   {
//     options: [
//       {
//         name: "Size",
//         values: [{ value: "41" }, { value: "42" }, { value: "43" }],
//       },
//       {
//         name: "Color",
//         values: [{ value: "Black" }, { value: "White" }],
//       },
//     ],

//     variants: [
//       {
//         name: "Black / 43",
//         sku: "SKX-BLK-43",
//         prices: [
//           { currency: "USD", amountMinor: 4299 },
//           { currency: "LKR", amountMinor: 1299000 },
//         ],
//         stock: 8,
//         selections: [
//           { option: "Size", value: "43" },
//           { option: "Color", value: "Black" },
//         ],
//       },
//     ],
//   }
