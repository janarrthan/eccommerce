import { PROMOTION_REVISION_STATUSES, PROMOTION_STATUSES } from "./promotions.constants.js";
import { PROMOTION_ERROR_CODES, PromotionDomainError } from "./promotions.errors.js";
import type { PromotionRevisionStatus, PromotionStatus } from "./promotions.types.js";

/** Supplies the minimum revision fields needed to derive whether revision `revision-2` is active at a given time. */
export type PromotionStatusRevision = Readonly<{
  id: string;
  status: PromotionRevisionStatus;
  startsAt: Date;
  endsAt: Date | null;
}>;

/** Supplies lifecycle controls and one authoritative clock value for a complete status derivation. */
export type DerivePromotionStatusInput = Readonly<{
  archivedAt: Date | null;
  disabledAt: Date | null;
  revisions: readonly PromotionStatusRevision[];
  now: Date;
}>;

/** Returns the main status plus secondary facts such as an active promotion having unpublished draft changes. */
export type DerivedPromotionStatus = Readonly<{
  status: PromotionStatus;
  activeRevisionId: string | null;
  hasDraftChanges: boolean;
  hasScheduledRevision: boolean;
}>;

function readTime(value: Date, fieldName: string): number {
  const time = value.getTime();

  if (!Number.isFinite(time)) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_STATUS_INPUT,
      `${fieldName} must contain a valid date.`,
    );
  }

  return time;
}

/**
 * Derives the customer-facing lifecycle state from promotion controls and revision schedules.
 *
 * The caller supplies `now` once. This prevents two comparisons near a boundary, such as 10:00:00, from observing
 * different clock values during the same request.
 */
export function derivePromotionStatus(input: DerivePromotionStatusInput): DerivedPromotionStatus {
  const nowTime = readTime(input.now, "now");
  const hasDraftChanges = input.revisions.some(({ status }) => status === PROMOTION_REVISION_STATUSES.DRAFT);

  if (input.archivedAt) {
    readTime(input.archivedAt, "archivedAt");
    return {
      status: PROMOTION_STATUSES.ARCHIVED,
      activeRevisionId: null,
      hasDraftChanges,
      hasScheduledRevision: false,
    };
  }

  if (input.disabledAt) {
    readTime(input.disabledAt, "disabledAt");
    return {
      status: PROMOTION_STATUSES.DISABLED,
      activeRevisionId: null,
      hasDraftChanges,
      hasScheduledRevision: false,
    };
  }

  const publishedRevisions = input.revisions.filter(({ status }) => status === PROMOTION_REVISION_STATUSES.PUBLISHED);
  const scheduledRevisions: PromotionStatusRevision[] = [];
  const activeRevisions: PromotionStatusRevision[] = [];

  for (const revision of publishedRevisions) {
    const startsAt = readTime(revision.startsAt, `Revision ${revision.id} startsAt`);
    const endsAt = revision.endsAt ? readTime(revision.endsAt, `Revision ${revision.id} endsAt`) : null;

    if (endsAt !== null && endsAt <= startsAt) {
      throw new PromotionDomainError(
        PROMOTION_ERROR_CODES.INVALID_STATUS_INPUT,
        `Revision ${revision.id} must end after it starts.`,
      );
    }

    if (startsAt > nowTime) {
      scheduledRevisions.push(revision);
    } else if (endsAt === null || nowTime < endsAt) {
      activeRevisions.push(revision);
    }
  }

  if (activeRevisions.length > 1) {
    throw new PromotionDomainError(
      PROMOTION_ERROR_CODES.INVALID_STATUS_INPUT,
      "A promotion cannot have more than one active published revision at the same time.",
    );
  }

  const hasScheduledRevision = scheduledRevisions.length > 0;

  if (activeRevisions.length === 1) {
    return {
      status: PROMOTION_STATUSES.ACTIVE,
      activeRevisionId: activeRevisions[0]?.id ?? null,
      hasDraftChanges,
      hasScheduledRevision,
    };
  }

  if (hasScheduledRevision) {
    return {
      status: PROMOTION_STATUSES.SCHEDULED,
      activeRevisionId: null,
      hasDraftChanges,
      hasScheduledRevision: true,
    };
  }

  return {
    status: publishedRevisions.length > 0 ? PROMOTION_STATUSES.EXPIRED : PROMOTION_STATUSES.DRAFT,
    activeRevisionId: null,
    hasDraftChanges,
    hasScheduledRevision: false,
  };
}
