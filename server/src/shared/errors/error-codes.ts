/**
 * Identifies one application failure with a stable, machine-readable value.
 *
 * A client can branch on a code such as `request.validation_failed` while the human-readable message changes. Keeping
 * those responsibilities separate prevents a wording improvement from silently breaking client behavior.
 */
export type ApplicationErrorCode = `${string}.${string}`;

export const SHARED_ERROR_CODES = {
  VALIDATION_FAILED: "request.validation_failed",
  INTERNAL_ERROR: "internal.unexpected_error",
} as const satisfies Record<string, ApplicationErrorCode>;
