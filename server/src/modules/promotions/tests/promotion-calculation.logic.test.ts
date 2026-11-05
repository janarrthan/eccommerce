import { describe, expect, it } from "vitest";

import {
  calculateFreeShippingRequest,
  calculateMonetaryBenefitRequest,
  isMinimumRequirementSatisfied,
  summarizeEligibleMerchandise,
} from "../promotion-calculation.logic.js";
import type { PromotionCartLine, PromotionTargetSet } from "../promotions.types.js";

const targetSet: PromotionTargetSet = {
  role: "PRODUCT_DISCOUNT",
  productIds: ["product-shoe"],
  variantIds: [],
  categoryIds: ["category-footwear"],
};

const lines: readonly PromotionCartLine[] = [
  {
    lineId: "line-a",
    productId: "product-shoe",
    variantId: "variant-black-42",
    categoryIds: ["category-footwear"],
    quantity: 4,
    reservedQuantity: 3,
    unitAmountMinor: 4_000,
  },
  {
    lineId: "line-b",
    productId: "product-hat",
    variantId: "variant-hat",
    categoryIds: ["category-accessories"],
    quantity: 1,
    reservedQuantity: 0,
    unitAmountMinor: 2_000,
  },
];

describe("promotion calculation foundations", () => {
  it("counts a line once when it matches both a product and a category", () => {
    expect(summarizeEligibleMerchandise(lines, "SPECIFIC_MERCHANDISE", targetSet)).toEqual({
      lineIds: ["line-a"],
      unitQuantity: 1,
      amountMinor: 4_000,
    });
  });

  it("treats product, variant, and category targets as one deduplicated union", () => {
    expect(
      summarizeEligibleMerchandise(lines, "SPECIFIC_MERCHANDISE", {
        ...targetSet,
        variantIds: ["variant-hat"],
      }),
    ).toEqual({
      lineIds: ["line-a", "line-b"],
      unitQuantity: 2,
      amountMinor: 6_000,
    });
  });

  it("uses only the remaining quantity after an earlier stage reserves units", () => {
    const summary = summarizeEligibleMerchandise(lines, "ALL_PRODUCTS", targetSet);

    expect(summary).toEqual({
      lineIds: ["line-a", "line-b"],
      unitQuantity: 2,
      amountMinor: 6_000,
    });
  });

  it("excludes a line when an earlier stage reserved every physical unit", () => {
    const fullyReservedLine: PromotionCartLine = {
      ...lines[0]!,
      quantity: 2,
      reservedQuantity: 2,
    };

    expect(summarizeEligibleMerchandise([fullyReservedLine], "ALL_PRODUCTS", targetSet)).toEqual({
      lineIds: [],
      unitQuantity: 0,
      amountMinor: 0,
    });
  });

  it("checks amount and quantity minimums against the matching summary", () => {
    const merchandise = { amountMinor: 6_000, unitQuantity: 2 };

    expect(isMinimumRequirementSatisfied({ mode: "NONE" }, merchandise)).toBe(true);

    expect(
      isMinimumRequirementSatisfied({ mode: "ELIGIBLE_MERCHANDISE_AMOUNT", requiredAmountMinor: 5_000 }, merchandise),
    ).toBe(true);

    expect(isMinimumRequirementSatisfied({ mode: "ELIGIBLE_UNIT_QUANTITY", requiredQuantity: 2 }, merchandise)).toBe(
      true,
    );

    expect(isMinimumRequirementSatisfied({ mode: "ELIGIBLE_UNIT_QUANTITY", requiredQuantity: 3 }, merchandise)).toBe(
      false,
    );
  });

  it("calculates percentage, once-per-order, and per-unit requests", () => {
    expect(
      calculateMonetaryBenefitRequest({
        calculationMethod: "PERCENTAGE",
        baseAmountMinor: 10_000,
        eligibleUnitQuantity: 2,
        percentageBasisPoints: 2_000,
      }),
    ).toBe(2_000);
    expect(
      calculateMonetaryBenefitRequest({
        calculationMethod: "FIXED_AMOUNT",
        baseAmountMinor: 10_000,
        eligibleUnitQuantity: 2,
        fixedAmountMinor: 750,
        fixedApplicationMode: "ONCE_PER_ORDER",
      }),
    ).toBe(750);
    expect(
      calculateMonetaryBenefitRequest({
        calculationMethod: "FIXED_AMOUNT",
        baseAmountMinor: 10_000,
        eligibleUnitQuantity: 2,
        fixedAmountMinor: 750,
        fixedApplicationMode: "PER_ELIGIBLE_UNIT",
      }),
    ).toBe(1_500);
  });

  it("treats the shipping-rate ceiling as an inclusive eligibility boundary", () => {
    expect(calculateFreeShippingRequest(1_500, null)).toBe(1_500);
    expect(calculateFreeShippingRequest(1_500, 1_500)).toBe(1_500);
    expect(calculateFreeShippingRequest(1_501, 1_500)).toBe(0);
  });
});
