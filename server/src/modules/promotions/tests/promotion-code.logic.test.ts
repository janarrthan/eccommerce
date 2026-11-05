import { describe, expect, it } from "vitest";

import { normalizeDiscountCode } from "../promotion-code.logic.js";
import { PROMOTION_ERROR_CODES, PromotionDomainError } from "../promotions.errors.js";

describe("normalizeDiscountCode", () => {
  it("trims surrounding whitespace and stores one uppercase identity", () => {
    expect(normalizeDiscountCode("  save-20_2026  ")).toBe("SAVE-20_2026");
  });

  it.each(["AB", "a".repeat(33), "SAVE 20", "SAVE.20", "සාදරයෙන්"])('rejects the invalid code "%s"', (code) => {
    expect(() => normalizeDiscountCode(code)).toThrowError(
      expect.objectContaining<Partial<PromotionDomainError>>({ code: PROMOTION_ERROR_CODES.INVALID_CODE }),
    );
  });

  it("accepts the documented minimum and maximum lengths", () => {
    expect(normalizeDiscountCode("SAVE20")).toBe("SAVE20");
    expect(normalizeDiscountCode("a".repeat(16))).toBe("A".repeat(16));
  });

  it.each(["A".repeat(5), "a".repeat(17)])("rejects a code outside the documented length boundaries", (code) => {
    expect(() => normalizeDiscountCode(code)).toThrowError(
      expect.objectContaining<Partial<PromotionDomainError>>({ code: PROMOTION_ERROR_CODES.INVALID_CODE }),
    );
  });
});
