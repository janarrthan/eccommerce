import { HttpError } from "../../shared/errors/http-error.js";
import type { ProductVariantImagesInput } from "./product-variant-images.validation.js";

export function validateVariantImageAssignments(
  input: ProductVariantImagesInput,
  productVariantIds: readonly string[],
  productImageIds: readonly string[],
) {
  const allowedVariantIds = new Set(productVariantIds);
  const allowedImageIds = new Set(productImageIds);
  // A variant may appear only once because each entry replaces its complete link list.
  const usedVariantIds = new Set<string>();

  for (const assignment of input.variants) {
    if (!allowedVariantIds.has(assignment.variantId) || usedVariantIds.has(assignment.variantId)) {
      throw new HttpError(400, "Each variant ID must belong to this product and appear only once.");
    }
    usedVariantIds.add(assignment.variantId);

    // Reuse across different variants is allowed; duplication within one variant is not.
    if (new Set(assignment.imageIds).size !== assignment.imageIds.length) {
      throw new HttpError(400, "Each image may appear only once for a variant.");
    }

    if (assignment.imageIds.some((imageId) => !allowedImageIds.has(imageId))) {
      throw new HttpError(400, "Each image ID must belong to this product.");
    }
  }
}
