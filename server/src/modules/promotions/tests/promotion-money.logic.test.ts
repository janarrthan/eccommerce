import { describe, expect, it } from "vitest";

import {
  allocateAvailableAmountBetweenPromotions,
  allocatePromotionDiscountAcrossLines,
  calculatePercentageAmount,
  reconcileDiscountRequests,
} from "../promotion-money.logic.js";

describe("promotion money primitives", () => {
  it("calculates basis-point percentages and rounds fractional minor units down", () => {
    expect(calculatePercentageAmount(1_003, 2_500)).toBe(250);
    expect(calculatePercentageAmount(10_000, 10_000)).toBe(10_000);
  });

  it("rejects percentages outside one to ten thousand basis points", () => {
    expect(() => calculatePercentageAmount(1_000, 0)).toThrow("percentageBasisPoints");
    expect(() => calculatePercentageAmount(1_000, 10_001)).toThrow("percentageBasisPoints");
  });

  it("uses largest remainders to reconcile same-layer overflow", () => {
    expect(
      reconcileDiscountRequests(
        [
          { id: "promotion-a", requestedAmountMinor: 7_000 },
          { id: "promotion-b", requestedAmountMinor: 5_000 },
        ],
        10_000,
      ),
    ).toEqual([
      {
        id: "promotion-a",
        requestedAmountMinor: 7_000,
        requestAfterPromotionCapMinor: 7_000,
        appliedAmountMinor: 5_833,
        wasCapped: true,
      },
      {
        id: "promotion-b",
        requestedAmountMinor: 5_000,
        requestAfterPromotionCapMinor: 5_000,
        appliedAmountMinor: 4_167,
        wasCapped: true,
      },
    ]);
  });

  it("breaks equal remainders by immutable ID", () => {
    expect(
      allocateAvailableAmountBetweenPromotions(1, [
        { promotionId: "promotion-b", requestedAmountMinor: 1 },
        { promotionId: "promotion-a", requestedAmountMinor: 1 },
      ]),
    ).toEqual([
      { promotionId: "promotion-a", appliedAmountMinor: 1 },
      { promotionId: "promotion-b", appliedAmountMinor: 0 },
    ]);
  });

  it("allocates one promotion's applied discount across its eligible lines", () => {
    expect(
      allocatePromotionDiscountAcrossLines(5_833, [
        { lineId: "line-a", discountableAmountMinor: 6_000 },
        { lineId: "line-b", discountableAmountMinor: 4_000 },
      ]),
    ).toEqual([
      { lineId: "line-a", discountAmountMinor: 3_500 },
      { lineId: "line-b", discountAmountMinor: 2_333 },
    ]);
  });

  it("does not allocate more than the promotions requested", () => {
    expect(
      allocateAvailableAmountBetweenPromotions(5_000, [{ promotionId: "promotion-a", requestedAmountMinor: 1_200 }]),
    ).toEqual([{ promotionId: "promotion-a", appliedAmountMinor: 1_200 }]);
  });

  it("preserves the uncapped request when a promotion maximum applies", () => {
    expect(
      reconcileDiscountRequests([{ id: "promotion-a", requestedAmountMinor: 2_000, maximumAmountMinor: 1_200 }], 5_000),
    ).toEqual([
      {
        id: "promotion-a",
        requestedAmountMinor: 2_000,
        requestAfterPromotionCapMinor: 1_200,
        appliedAmountMinor: 1_200,
        wasCapped: true,
      },
    ]);
  });

  it("rejects duplicate allocation IDs", () => {
    expect(() =>
      allocateAvailableAmountBetweenPromotions(1, [
        { promotionId: "same-id", requestedAmountMinor: 1 },
        { promotionId: "same-id", requestedAmountMinor: 1 },
      ]),
    ).toThrow("unique");

    expect(() =>
      allocatePromotionDiscountAcrossLines(1, [
        { lineId: "same-id", discountableAmountMinor: 1 },
        { lineId: "same-id", discountableAmountMinor: 1 },
      ]),
    ).toThrow("unique");
  });

  it("rejects unsafe money and line discounts larger than the eligible line value", () => {
    expect(() => calculatePercentageAmount(Number.MAX_SAFE_INTEGER + 1, 1_000)).toThrow("safe integer");
    expect(() => allocatePromotionDiscountAcrossLines(3, [{ lineId: "line-a", discountableAmountMinor: 2 }])).toThrow(
      "cannot exceed",
    );
  });
});
