import { describe, expect, it } from "vitest";

import { cartItemParamsSchema, cartItemQuantityInputSchema, cartQuerySchema } from "../cart.validation.js";

describe("cart validation", () => {
  it("normalizes a requested currency and accepts a positive integer quantity", () => {
    expect(cartQuerySchema.parse({ currency: " eur " })).toEqual({ currency: "EUR" });
    expect(cartItemQuantityInputSchema.parse({ quantity: 500 })).toEqual({ quantity: 500 });
  });

  it.each([-1, 0, 1.5])("rejects item quantity %s", (quantity) => {
    expect(() => cartItemQuantityInputSchema.parse({ quantity })).toThrow();
  });

  it("rejects unknown body and query properties", () => {
    expect(() => cartItemQuantityInputSchema.parse({ quantity: 1, variantId: "client-controlled" })).toThrow();
    expect(() => cartQuerySchema.parse({ currency: "USD", price: "1" })).toThrow();
  });

  it("requires a bounded non-empty variant ID", () => {
    expect(cartItemParamsSchema.parse({ variantId: " variant-1 " })).toEqual({ variantId: "variant-1" });
    expect(() => cartItemParamsSchema.parse({ variantId: " " })).toThrow();
    expect(() => cartItemParamsSchema.parse({ variantId: "v".repeat(101) })).toThrow();
  });
});
