import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { validateVariantImageAssignments } from "./product-variant-images.logic.js";
import { productVariantImagesInputSchema } from "./product-variant-images.validation.js";
import { productImageSelect } from "./products.service.js";

// Fields selected for each ProductVariant and its explicit image links.
const productVariantSelectFields = {
  id: true,
  name: true,
  sku: true,
  isActive: true,
  imageLinks: {
    orderBy: [{ position: "asc" }, { imageId: "asc" }],
    select: { imageId: true, position: true },
  },
} satisfies Prisma.ProductVariantSelect;

// Admin read model: the product's image library plus every variant assignment.
const productWithVariantImagesSelectFields = {
  id: true,
  images: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: productImageSelect,
  },
  variants: {
    orderBy: [{ isActive: "desc" }, { sku: "asc" }],
    select: productVariantSelectFields,
  },
} satisfies Prisma.ProductSelect;

export async function getProductVariantImageAssignments(productId: string) {
  // This admin response shows explicit links; storefront fallback is added elsewhere.
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: productWithVariantImagesSelectFields,
  });

  if (!product) {
    throw new HttpError(404, "Product not found.");
  }

  return product;
}

export async function configureProductVariantImages(productId: string, rawInput: unknown) {
  const input = productVariantImagesInputSchema.parse(rawInput);

  // Retrying serialization conflicts keeps simultaneous catalog edits safe.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Touch the Product row first so concurrent catalog updates for this product are serialized.
          const product = await tx.product.update({
            where: { id: productId },
            data: { updatedAt: new Date() },
            select: {
              images: { select: { id: true } },
              variants: { select: { id: true } },
            },
          });

          // Validate the complete request before deleting any existing links.
          validateVariantImageAssignments(
            input,
            product.variants.map(({ id }) => id),
            product.images.map(({ id }) => id),
          );

          const variantIds = input.variants.map(({ variantId }) => variantId);

          if (variantIds.length > 0) {
            // Recreate submitted links so imageIds array order defines position.
            await tx.productVariantImage.deleteMany({
              where: { variantId: { in: variantIds } },
            });

            const imageLinks = input.variants.flatMap((assignment) =>
              assignment.imageIds.map((imageId, position) => ({
                variantId: assignment.variantId,
                imageId,
                position,
              })),
            );
            if (imageLinks.length > 0) {
              await tx.productVariantImage.createMany({ data: imageLinks });
            }
          }

          return tx.product.findUniqueOrThrow({
            where: { id: productId },
            select: productWithVariantImagesSelectFields,
          });
        },
        { isolationLevel: "Serializable", timeout: 15000 },
      );
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code === "P2025") {
        throw new HttpError(404, "Product not found.");
      }
      if (code === "P2002") {
        throw new HttpError(409, "An image is already assigned to this variant.");
      }
      if (code === "P2034") {
        if (attempt < 2) continue;
        throw new HttpError(409, "Variant images changed concurrently. Reload and try again.");
      }
      throw error;
    }
  }

  throw new HttpError(409, "Unable to configure variant images. Try again.");
}
