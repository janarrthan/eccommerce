import {
  MAX_CALCULATED_MINOR_AMOUNT,
  MAX_PERCENTAGE_BASIS_POINTS,
  MIN_PERCENTAGE_BASIS_POINTS,
} from "./promotions.constants.js";
import { PROMOTION_ERROR_CODES, PromotionDomainError } from "./promotions.errors.js";

/** Records one promotion's capped request before the available cart amount is shared between promotions. */
export type PromotionAmountRequest = Readonly<{
  promotionId: string;
  requestedAmountMinor: number;
}>;

/** Records how much of the available cart amount one promotion receives. */
export type PromotionAmountAllocation = Readonly<{
  promotionId: string;
  appliedAmountMinor: number;
}>;

/** Records one cart or order line's value that is eligible for a promotion discount. */
export type DiscountableLine = Readonly<{
  lineId: string;
  discountableAmountMinor: number;
}>;

/** Records how much of one promotion's applied discount belongs to a cart or order line. */
export type PromotionLineDiscountAllocation = Readonly<{
  lineId: string;
  discountAmountMinor: number;
}>;

type AllocationClaim = Readonly<{ id: string; claimAmountMinor: number }>;
type AllocationShare = Readonly<{ id: string; amountMinor: number }>;

/** Keeps an uncapped request and its optional business maximum, such as LKR 2,000 capped at LKR 1,200. */
export type DiscountRequest = Readonly<{
  id: string;
  requestedAmountMinor: number;
  maximumAmountMinor?: number | null;
}>;

/** Preserves every stage of capping so later diagnostics can explain why a requested amount changed. */
export type ReconciledDiscountRequest = Readonly<{
  id: string;
  requestedAmountMinor: number;
  requestAfterPromotionCapMinor: number;
  appliedAmountMinor: number;
  wasCapped: boolean;
}>;

function throwInvalidAmount(message: string): never {
  throw new PromotionDomainError(PROMOTION_ERROR_CODES.INVALID_AMOUNT, message);
}

/** Ensures a value such as `4500` LKR minor units is a non-negative safe integer before money calculation. */
export function assertNonNegativeMinorAmount(amountMinor: number, fieldName: string): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > MAX_CALCULATED_MINOR_AMOUNT) {
    throwInvalidAmount(`${fieldName} must be a non-negative safe integer in minor currency units.`);
  }
}

/**
 * Adds monetary amounts stored as whole minor units, such as the totals for three products in a shopping cart.
 *
 * JavaScript cannot represent every integer above 9,007,199,254,740,991 exactly. For example, adding
 * 9,007,199,254,740,991 and 2 with regular numbers produces 9,007,199,254,740,992 instead of the correct total of
 * 9,007,199,254,740,993.
 *
 * This function uses BigInt while calculating the total and rejects a result that cannot be safely returned as a
 * number. Without that check, the application could save an incorrect order subtotal.
 */
export function addMinorAmounts(amounts: readonly number[], fieldName = "amounts"): number {
  let total = 0n;

  for (const amount of amounts) {
    assertNonNegativeMinorAmount(amount, fieldName);
    total += BigInt(amount);
  }

  if (total > BigInt(MAX_CALCULATED_MINOR_AMOUNT)) {
    throwInvalidAmount(`${fieldName} exceeds the largest safely supported calculated amount.`);
  }

  return Number(total);
}

/**
 * Calculates an integer percentage request and rounds fractional minor units down.
 *
 * For example, 25% of LKR 10.03 is 250 minor units, not 251. Rounding down prevents a discount from exceeding its
 * exact mathematical value; later allocation uses largest remainders to reconcile a known integer total.
 */
export function calculatePercentageAmount(baseAmountMinor: number, percentageBasisPoints: number): number {
  assertNonNegativeMinorAmount(baseAmountMinor, "baseAmountMinor");

  if (
    !Number.isInteger(percentageBasisPoints) ||
    percentageBasisPoints < MIN_PERCENTAGE_BASIS_POINTS ||
    percentageBasisPoints > MAX_PERCENTAGE_BASIS_POINTS
  ) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_PERCENTAGE,
      `percentageBasisPoints must be an integer from ${MIN_PERCENTAGE_BASIS_POINTS} to ${MAX_PERCENTAGE_BASIS_POINTS}.`,
    );
  }

  return Number((BigInt(baseAmountMinor) * BigInt(percentageBasisPoints)) / 10_000n);
}

function allocateMinorAmountByClaim(
  amountToAllocateMinor: number,
  claims: readonly AllocationClaim[],
): readonly AllocationShare[] {
  assertNonNegativeMinorAmount(amountToAllocateMinor, "amountToAllocateMinor");

  const seenIds = new Set<string>();
  const entries = claims.map(({ id, claimAmountMinor }) => {
    if (!id || seenIds.has(id)) {
      throw new PromotionDomainError(
        PROMOTION_ERROR_CODES.INVALID_ALLOCATION,
        "Every allocation entry must have a unique, non-empty immutable ID.",
      );
    }

    seenIds.add(id);
    assertNonNegativeMinorAmount(claimAmountMinor, `Claim for ${id}`);
    return { id, claimAmountMinor };
  });

  const totalClaimAmountMinor = addMinorAmounts(
    entries.map(({ claimAmountMinor }) => claimAmountMinor),
    "allocation claims",
  );

  //It is a defensive check against accidentally passing an allocation amount greater than the combined claims.
  if (amountToAllocateMinor > totalClaimAmountMinor) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_ALLOCATION,
      "The amount to allocate cannot exceed the sum of its claims.",
    );
  }

  if (amountToAllocateMinor === 0) {
    return entries.map(({ id }) => ({ id, amountMinor: 0 })).sort((left, right) => left.id.localeCompare(right.id));
  }

  if (totalClaimAmountMinor === 0) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_ALLOCATION,
      "A positive amount cannot be allocated across zero total claims.",
    );
  }

  // Example: 20,000 minor units to allocate across two promotions that requested 7,000 and 5,000 minor units.
  // Available: 20,000
  // Amount to allocate: 12,000
  // Product A request: 7,000
  // Product B request: 5,000
  // Total requested: 12,000
  const divisor = BigInt(totalClaimAmountMinor); //12_000
  const shares = entries.map(({ id, claimAmountMinor }) => {
    const numerator = BigInt(amountToAllocateMinor) * BigInt(claimAmountMinor); // 12_000 * 7_000 = 84_000_000
    return {
      id,
      amountMinor: Number(numerator / divisor), // 84_000_000 / 12_000 = 7_000
      remainder: numerator % divisor, // 84_000_000 % 12_000 = 0
    };
  });

  let remaining = amountToAllocateMinor - addMinorAmounts(shares.map(({ amountMinor }) => amountMinor)); // 0

  const remainderOrder = [...shares].sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.id.localeCompare(right.id);
    }

    return left.remainder > right.remainder ? -1 : 1;
  });

  for (const share of remainderOrder) {
    if (remaining === 0) {
      break;
    }

    share.amountMinor += 1;
    remaining -= 1;
  }

  return shares
    .map(({ id, amountMinor }) => ({ id, amountMinor }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Shares the amount available at one promotion stage between the promotions that requested it.
 *
 * For example, requests of 7,000 and 5,000 minor units against 10,000 available minor units receive 5,833 and 4,167.
 * If the cart has more money available than the promotions requested, each promotion receives only its request.
 */
export function allocateAvailableAmountBetweenPromotions(
  availableAmountMinor: number,
  promotionRequests: readonly PromotionAmountRequest[],
): readonly PromotionAmountAllocation[] {
  assertNonNegativeMinorAmount(availableAmountMinor, "availableAmountMinor");

  const totalRequestedAmountMinor = addMinorAmounts(
    promotionRequests.map(({ requestedAmountMinor }) => requestedAmountMinor),
    "promotion requests",
  );

  const amountToAllocateMinor = Math.min(availableAmountMinor, totalRequestedAmountMinor);

  return allocateMinorAmountByClaim(
    amountToAllocateMinor,
    promotionRequests.map(({ promotionId, requestedAmountMinor }) => ({
      id: promotionId,
      claimAmountMinor: requestedAmountMinor,
    })),
  ).map(({ id, amountMinor }) => ({ promotionId: id, appliedAmountMinor: amountMinor }));
}

/**
 * Attributes one promotion's applied discount to the cart or order lines whose value qualified for that promotion.
 *
 * For example, a 5,833-minor-unit discount across lines worth 6,000 and 4,000 minor units assigns 3,500 to the first
 * line and 2,333 to the second. Recording the exact split lets a later refund restore the correct amount for each line.
 */
export function allocatePromotionDiscountAcrossLines(
  promotionDiscountAmountMinor: number,
  discountableLines: readonly DiscountableLine[],
): readonly PromotionLineDiscountAllocation[] {
  return allocateMinorAmountByClaim(
    promotionDiscountAmountMinor,
    discountableLines.map(({ lineId, discountableAmountMinor }) => ({
      id: lineId,
      claimAmountMinor: discountableAmountMinor,
    })),
  ).map(({ id, amountMinor }) => ({ lineId: id, discountAmountMinor: amountMinor }));
}

/**
 * Applies per-promotion maxima and a shared layer cap while preserving every uncapped request for audit evidence.
 *
 * Requests of 7,000 and 5,000 against 10,000 remaining minor units become 5,833 and 4,167. Applying promotions one
 * at a time would make the result depend on iteration order, so the shared overflow is allocated proportionally.
 */
export function reconcileDiscountRequests(
  requests: readonly DiscountRequest[],
  availableAmountMinor: number,
): readonly ReconciledDiscountRequest[] {
  assertNonNegativeMinorAmount(availableAmountMinor, "availableAmountMinor");

  const cappedRequests = requests.map(({ id, requestedAmountMinor, maximumAmountMinor }) => {
    assertNonNegativeMinorAmount(requestedAmountMinor, `requestedAmountMinor for ${id}`);

    if (maximumAmountMinor !== undefined && maximumAmountMinor !== null) {
      assertNonNegativeMinorAmount(maximumAmountMinor, `maximumAmountMinor for ${id}`);
    }

    return {
      id,
      requestedAmountMinor,
      requestAfterPromotionCapMinor:
        maximumAmountMinor === undefined || maximumAmountMinor === null
          ? requestedAmountMinor
          : Math.min(requestedAmountMinor, maximumAmountMinor),
    };
  });

  const allocations = new Map(
    allocateAvailableAmountBetweenPromotions(
      availableAmountMinor,
      cappedRequests.map(({ id, requestAfterPromotionCapMinor }) => ({
        promotionId: id,
        requestedAmountMinor: requestAfterPromotionCapMinor,
      })),
    ).map(({ promotionId, appliedAmountMinor }) => [promotionId, appliedAmountMinor]),
  );

  return cappedRequests
    .map(({ id, requestedAmountMinor, requestAfterPromotionCapMinor }) => {
      const appliedAmountMinor = allocations.get(id) ?? 0;
      return {
        id,
        requestedAmountMinor,
        requestAfterPromotionCapMinor,
        appliedAmountMinor,
        wasCapped: appliedAmountMinor < requestedAmountMinor,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
