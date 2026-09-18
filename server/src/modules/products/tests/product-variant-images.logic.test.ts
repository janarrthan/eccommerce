import { describe, expect, it } from "vitest";

import { validateVariantImageAssignments } from "../product-variant-images.logic.js";
import { productVariantImagesInputSchema } from "../product-variant-images.validation.js";

describe("variant image assignments", () => {
  it("allows ordered images, shared images, and explicit removal", () => {
    expect(() =>
      validateVariantImageAssignments(
        {
          variants: [
            { variantId: "medium-blue", imageIds: ["front", "back"] },
            { variantId: "large-blue", imageIds: ["front"] },
            { variantId: "black", imageIds: [] },
          ],
        },
        ["medium-blue", "large-blue", "black"],
        ["front", "back"],
      ),
    ).not.toThrow();
  });

  it("rejects foreign or repeated variant IDs", () => {
    expect(() =>
      validateVariantImageAssignments({ variants: [{ variantId: "foreign", imageIds: [] }] }, ["variant"], ["image"]),
    ).toThrow("variant ID must belong");
    expect(() =>
      validateVariantImageAssignments(
        {
          variants: [
            { variantId: "variant", imageIds: [] },
            { variantId: "variant", imageIds: [] },
          ],
        },
        ["variant"],
        ["image"],
      ),
    ).toThrow("appear only once");
  });

  it("rejects foreign or repeated image IDs within a variant", () => {
    expect(() =>
      validateVariantImageAssignments(
        { variants: [{ variantId: "variant", imageIds: ["foreign"] }] },
        ["variant"],
        ["image"],
      ),
    ).toThrow("image ID must belong");
    expect(() =>
      validateVariantImageAssignments(
        {
          variants: [{ variantId: "variant", imageIds: ["image", "image"] }],
        },
        ["variant"],
        ["image"],
      ),
    ).toThrow("only once for a variant");
  });

  it("trims IDs and rejects unknown properties", () => {
    expect(
      productVariantImagesInputSchema.parse({
        variants: [{ variantId: " variant ", imageIds: [" image "] }],
      }),
    ).toEqual({
      variants: [{ variantId: "variant", imageIds: ["image"] }],
    });
    expect(
      productVariantImagesInputSchema.safeParse({
        variants: [{ variantId: "variant", imageIds: [], extra: true }],
      }).success,
    ).toBe(false);
  });
});
