import { describe, expect, it } from "vitest";

import { HttpError } from "../../../shared/errors/http-error.js";
import { CART_ITEM_AVAILABILITIES } from "../cart.constants.js";
import { calculateCartLineTotal, calculateCartTotals, getCartItemAvailability } from "../cart.logic.js";

describe("cart logic", () => {
  it.each([
    [false, true, 5, 1, CART_ITEM_AVAILABILITIES.PRODUCT_INACTIVE],
    [true, false, 5, 1, CART_ITEM_AVAILABILITIES.VARIANT_INACTIVE],
    [true, true, -1, 1, CART_ITEM_AVAILABILITIES.OUT_OF_STOCK],
    [true, true, 0, 1, CART_ITEM_AVAILABILITIES.OUT_OF_STOCK],
    [true, true, 2, 3, CART_ITEM_AVAILABILITIES.INSUFFICIENT_STOCK],
    [true, true, 3, 3, CART_ITEM_AVAILABILITIES.AVAILABLE],
  ])(
    "resolves product=%s variant=%s stock=%i quantity=%i as %s",
    (productIsActive, variantIsActive, stock, quantity, expected) => {
      expect(getCartItemAvailability({ productIsActive, variantIsActive, stock, quantity })).toBe(expected);
    },
  );

  it("calculates integer line and cart totals", () => {
    expect(calculateCartLineTotal(3, 2499)).toBe(7497);
    expect(
      calculateCartTotals([
        { quantity: 3, unitAmountMinor: 2499 },
        { quantity: 2, unitAmountMinor: 1250 },
      ]),
    ).toEqual({
      itemCount: 2,
      totalQuantity: 5,
      subtotalAmountMinor: 9997,
    });
  });

  it("rejects invalid or unsafe monetary inputs", () => {
    expect(() => calculateCartLineTotal(-1, 100)).toThrow(HttpError);
    expect(() => calculateCartLineTotal(1, 1.5)).toThrow(HttpError);
    expect(() => calculateCartLineTotal(Number.MAX_SAFE_INTEGER + 1, 1)).toThrow(HttpError);
    expect(() => calculateCartLineTotal(Number.MAX_SAFE_INTEGER, 2)).toThrow(
      "The cart line total exceeds the supported amount range.",
    );
  });
});
