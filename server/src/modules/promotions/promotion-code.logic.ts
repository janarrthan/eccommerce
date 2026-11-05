import { MAX_DISCOUNT_CODE_LENGTH, MIN_DISCOUNT_CODE_LENGTH } from "./promotions.constants.js";
import { PROMOTION_ERROR_CODES, PromotionDomainError } from "./promotions.errors.js";

const DISCOUNT_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Converts an administrator-entered discount code into its canonical lookup value.
 *
 * For example, ` save-20 ` becomes `SAVE-20`. Spaces inside the value and non-ASCII characters are rejected so the
 * value shown to an administrator has one unambiguous database identity.
 */
export function normalizeDiscountCode(input: string): string {
  const normalizedCode = input.trim().toUpperCase();

  if (
    normalizedCode.length < MIN_DISCOUNT_CODE_LENGTH ||
    normalizedCode.length > MAX_DISCOUNT_CODE_LENGTH ||
    !DISCOUNT_CODE_PATTERN.test(normalizedCode)
  ) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_CODE,
      `A discount code must contain ${MIN_DISCOUNT_CODE_LENGTH} to ${MAX_DISCOUNT_CODE_LENGTH} ASCII letters, numbers, hyphens, or underscores.`,
    );
  }

  return normalizedCode;
}
