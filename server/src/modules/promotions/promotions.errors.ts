import type { ApplicationErrorCode } from "../../shared/errors/error-codes.js";

export const PROMOTION_ERROR_CODES = {
  INVALID_CODE: "promotion.code_invalid",
  INVALID_STATUS_INPUT: "promotion.status_input_invalid",
  INVALID_AMOUNT: "promotion.amount_invalid",
  INVALID_PERCENTAGE: "promotion.percentage_invalid",
  INVALID_ALLOCATION: "promotion.allocation_invalid",
  INVALID_CALCULATION_INPUT: "promotion.calculation_input_invalid",
} as const satisfies Record<string, ApplicationErrorCode>;

export type PromotionErrorCode = (typeof PROMOTION_ERROR_CODES)[keyof typeof PROMOTION_ERROR_CODES];

/**
 * Describes a deterministic promotion-rule failure without depending on Express or another delivery mechanism.
 *
 * For example, a negative amount raises `promotion.amount_invalid`. A future HTTP service can translate that failure,
 * while a checkout worker can record the same code without importing Express.
 */
export class PromotionDomainError extends Error {
  constructor(
    public readonly code: PromotionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PromotionDomainError";
  }
}
