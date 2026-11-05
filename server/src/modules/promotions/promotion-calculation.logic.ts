import {
  FIXED_APPLICATION_MODES,
  PROMOTION_CALCULATION_METHODS,
  PROMOTION_TARGET_MODES,
} from "./promotions.constants.js";
import { PROMOTION_ERROR_CODES, PromotionDomainError } from "./promotions.errors.js";
import { addMinorAmounts, assertNonNegativeMinorAmount, calculatePercentageAmount } from "./promotion-money.logic.js";
import type {
  FixedApplicationMode,
  PromotionCalculationMethod,
  PromotionCartLine,
  PromotionTargetMode,
  PromotionTargetSet,
} from "./promotions.types.js";

/**
 * Describes the merchandise that one promotion may still use after earlier promotion stages reserve units.
 *
 * For example, if a cart line contains four shoes worth 4,000 minor units each and Buy X Get Y reserves three of
 * them, the summary contains that line's ID, one remaining unit, and 4,000 minor units. Later minimum and discount
 * calculations use the same summary so a reserved shoe cannot receive a second product discount.
 */
export type EligibleMerchandiseSummary = Readonly<{
  lineIds: readonly string[];
  unitQuantity: number;
  amountMinor: number;
}>;

/**
 * Describes the threshold a cart must meet before a promotion can apply.
 *
 * An amount mode can require 5,000 minor units of eligible merchandise, while a quantity mode can require three
 * physical shoes. Keeping those modes separate prevents a cart with two lines containing three shoes from being
 * mistaken for only two eligible units.
 */
export type MinimumRequirement = Readonly<{
  mode:
    | "NONE"
    | "ELIGIBLE_MERCHANDISE_AMOUNT"
    | "ELIGIBLE_UNIT_QUANTITY"
    | "MERCHANDISE_SUBTOTAL"
    | "MERCHANDISE_UNIT_QUANTITY";
  requiredAmountMinor?: number | null;
  requiredQuantity?: number | null;
}>;

function assertNonNegativeQuantity(quantity: number, fieldName: string): void {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_CALCULATION_INPUT,
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

/**
 * Reports whether a cart line belongs to the merchandise selected by a promotion.
 *
 * A specific-merchandise target is a union: a line qualifies when its product, variant, or any category is selected.
 * A shoe selected by both product ID and footwear category still produces one match, not two discounts.
 */
export function doesLineMatchTargetSet(
  line: PromotionCartLine,
  targetMode: PromotionTargetMode,
  targetSet: PromotionTargetSet,
): boolean {
  if (targetMode === PROMOTION_TARGET_MODES.ALL_PRODUCTS) {
    return true;
  }

  return (
    targetSet.productIds.includes(line.productId) ||
    targetSet.variantIds.includes(line.variantId) ||
    line.categoryIds.some((categoryId) => targetSet.categoryIds.includes(categoryId))
  );
}

/**
 * Totals the unique cart lines, physical units, and merchandise value that a promotion may use.
 *
 * For example, a line with four shoes worth 4,000 minor units each contributes one unit and 4,000 minor units when
 * Buy X Get Y has already reserved three shoes. A fully reserved line contributes nothing, which prevents the same
 * physical unit from participating in both Buy X Get Y and an ordinary product discount.
 *
 * Product, variant, and category targets form one union. A line that matches both its product ID and footwear category
 * is therefore counted once; counting every matching relationship would invent extra units and inflate the discount.
 */
export function summarizeEligibleMerchandise(
  lines: readonly PromotionCartLine[],
  targetMode: PromotionTargetMode,
  targetSet: PromotionTargetSet,
): EligibleMerchandiseSummary {
  const seenLineIds = new Set<string>();

  const eligibleLines = lines.filter((line) => {
    if (!line.lineId || seenLineIds.has(line.lineId)) {
      throw new PromotionDomainError(
        PROMOTION_ERROR_CODES.INVALID_CALCULATION_INPUT,
        "Every cart line must have a unique, non-empty line ID.",
      );
    }

    seenLineIds.add(line.lineId);
    assertNonNegativeQuantity(line.quantity, `quantity for ${line.lineId}`);
    assertNonNegativeQuantity(line.reservedQuantity, `reservedQuantity for ${line.lineId}`);
    assertNonNegativeMinorAmount(line.unitAmountMinor, `unitAmountMinor for ${line.lineId}`);

    // Reserved units must be part of the quantity that physically exists on the line. Allowing five reserved shoes on
    // a three-shoe line would produce a negative eligible quantity and corrupt every later minimum and discount.
    if (line.reservedQuantity > line.quantity) {
      throw new PromotionDomainError(
        PROMOTION_ERROR_CODES.INVALID_CALCULATION_INPUT,
        `reservedQuantity for ${line.lineId} cannot exceed its quantity.`,
      );
    }

    return line.quantity > line.reservedQuantity && doesLineMatchTargetSet(line, targetMode, targetSet);
  });

  const remainingQuantities = eligibleLines.map(({ quantity, reservedQuantity }) => quantity - reservedQuantity);
  const amounts = eligibleLines.map(
    ({ quantity, reservedQuantity, unitAmountMinor }) => (quantity - reservedQuantity) * unitAmountMinor,
  );

  // Valid quantities and unit amounts can still produce an unsafe JavaScript integer when multiplied. Reject that
  // result before an imprecise value can enter a promotion total.
  for (const amount of amounts) {
    assertNonNegativeMinorAmount(amount, "eligible line amount");
  }

  return {
    lineIds: eligibleLines.map(({ lineId }) => lineId).sort((left, right) => left.localeCompare(right)),
    unitQuantity: addMinorAmounts(remainingQuantities, "eligible unit quantities"),
    amountMinor: addMinorAmounts(amounts, "eligible merchandise amounts"),
  };
}

/**
 * Decides whether eligible merchandise meets the minimum configured for a promotion.
 *
 * For example, merchandise worth 6,000 minor units and containing two physical units satisfies a 5,000-minor-unit
 * requirement and a two-unit requirement, but not a three-unit requirement. Amount modes inspect only money and
 * quantity modes inspect only physical units, so two cart lines are never mistaken for two items.
 */
export function isMinimumRequirementSatisfied(
  requirement: MinimumRequirement,
  merchandise: Readonly<{ amountMinor: number; unitQuantity: number }>,
): boolean {
  assertNonNegativeMinorAmount(merchandise.amountMinor, "merchandise.amountMinor");
  assertNonNegativeQuantity(merchandise.unitQuantity, "merchandise.unitQuantity");

  if (requirement.mode === "NONE") {
    return true;
  }

  if (requirement.mode === "ELIGIBLE_MERCHANDISE_AMOUNT" || requirement.mode === "MERCHANDISE_SUBTOTAL") {
    if (requirement.requiredAmountMinor === undefined || requirement.requiredAmountMinor === null) {
      throw new PromotionDomainError(
        PROMOTION_ERROR_CODES.INVALID_CALCULATION_INPUT,
        `${requirement.mode} requires requiredAmountMinor.`,
      );
    }

    assertNonNegativeMinorAmount(requirement.requiredAmountMinor, "requiredAmountMinor");
    return merchandise.amountMinor >= requirement.requiredAmountMinor;
  }

  if (requirement.requiredQuantity === undefined || requirement.requiredQuantity === null) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_CALCULATION_INPUT,
      `${requirement.mode} requires requiredQuantity.`,
    );
  }

  assertNonNegativeQuantity(requirement.requiredQuantity, "requiredQuantity");
  return merchandise.unitQuantity >= requirement.requiredQuantity;
}

/**
 * Calculates how much money a percentage or fixed promotion requests before any cap is applied.
 *
 * A 20% benefit on 10,000 minor units requests 2,000. A fixed benefit of 750 requests 750 once per order or 1,500
 * when it applies to each of two eligible units.
 *
 * This function deliberately does not reduce the request to the merchandise value or an optional promotion maximum.
 * The later reconciliation step keeps the original request and the applied amount separately; without both values,
 * an order could not explain that a Rs 120 combined request was limited to a Rs 100 subtotal.
 */
export function calculateMonetaryBenefitRequest(
  input: Readonly<{
    calculationMethod: PromotionCalculationMethod;
    baseAmountMinor: number;
    eligibleUnitQuantity: number;
    percentageBasisPoints?: number | null;
    fixedAmountMinor?: number | null;
    fixedApplicationMode?: FixedApplicationMode | null;
  }>,
): number {
  assertNonNegativeMinorAmount(input.baseAmountMinor, "baseAmountMinor");
  assertNonNegativeQuantity(input.eligibleUnitQuantity, "eligibleUnitQuantity");

  if (input.calculationMethod === PROMOTION_CALCULATION_METHODS.PERCENTAGE) {
    if (input.percentageBasisPoints === undefined || input.percentageBasisPoints === null) {
      throw new PromotionDomainError(
        PROMOTION_ERROR_CODES.INVALID_CALCULATION_INPUT,
        "A percentage benefit requires percentageBasisPoints.",
      );
    }

    return calculatePercentageAmount(input.baseAmountMinor, input.percentageBasisPoints);
  }

  if (input.fixedAmountMinor === undefined || input.fixedAmountMinor === null || !input.fixedApplicationMode) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_CALCULATION_INPUT,
      "A fixed benefit requires fixedAmountMinor and fixedApplicationMode.",
    );
  }

  assertNonNegativeMinorAmount(input.fixedAmountMinor, "fixedAmountMinor");
  const requestedAmount =
    input.fixedApplicationMode === FIXED_APPLICATION_MODES.ONCE_PER_ORDER
      ? input.fixedAmountMinor
      : input.fixedAmountMinor * input.eligibleUnitQuantity;

  assertNonNegativeMinorAmount(requestedAmount, "fixed benefit request");
  return requestedAmount;
}

/**
 * Calculates the complete free-shipping request after destination and minimum checks have already passed.
 *
 * For example, a 1,500-minor-unit ceiling accepts a shipping rate of 1,500 and returns the complete 1,500 discount. A
 * rate of 1,501 returns zero because this setting controls eligibility; treating the ceiling as a partial discount
 * would silently change free shipping into 1,500 minor units off shipping.
 */
export function calculateFreeShippingRequest(
  selectedShippingRateMinor: number,
  shippingRateCeilingMinor: number | null,
): number {
  assertNonNegativeMinorAmount(selectedShippingRateMinor, "selectedShippingRateMinor");

  if (shippingRateCeilingMinor === null) {
    return selectedShippingRateMinor;
  }

  assertNonNegativeMinorAmount(shippingRateCeilingMinor, "shippingRateCeilingMinor");
  return selectedShippingRateMinor <= shippingRateCeilingMinor ? selectedShippingRateMinor : 0;
}
