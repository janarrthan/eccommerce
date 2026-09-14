import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);

export const productVariantImagesInputSchema = z
  .object({
    // An empty imageIds array intentionally removes every link for that variant.
    variants: z
      .array(
        z
          .object({
            variantId: idSchema,
            imageIds: z.array(idSchema).max(100),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();

export type ProductVariantImagesInput = z.infer<typeof productVariantImagesInputSchema>;
