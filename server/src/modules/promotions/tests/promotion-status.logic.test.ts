import { describe, expect, it } from "vitest";

import { derivePromotionStatus, type PromotionStatusRevision } from "../promotion-status.logic.js";

const now = new Date("2026-09-24T08:00:00.000Z");

function published(id: string, startsAt: string, endsAt: string | null = null): PromotionStatusRevision {
  return {
    id,
    status: "PUBLISHED",
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
  };
}

describe("derivePromotionStatus", () => {
  it("marks a promotion as active when the current time equals its start time", () => {
    expect(
      derivePromotionStatus({
        archivedAt: null,
        disabledAt: null,
        now,
        revisions: [published("revision-1", now.toISOString(), "2026-09-24T09:00:00.000Z")],
      }),
    ).toMatchObject({ status: "ACTIVE", activeRevisionId: "revision-1" });
  });

  it("marks a promotion as expired when the current time equals its end time", () => {
    expect(
      derivePromotionStatus({
        archivedAt: null,
        disabledAt: null,
        now,
        revisions: [published("revision-1", "2026-09-24T07:00:00.000Z", now.toISOString())],
      }),
    ).toMatchObject({ status: "EXPIRED", activeRevisionId: null });
  });

  it("reports draft changes and a scheduled successor without changing the active status", () => {
    const result = derivePromotionStatus({
      archivedAt: null,
      disabledAt: null,
      now,
      revisions: [
        published("active", "2026-09-20T00:00:00.000Z"),
        published("next", "2026-10-01T00:00:00.000Z"),
        {
          id: "draft",
          status: "DRAFT",
          startsAt: new Date("2026-10-10T00:00:00.000Z"),
          endsAt: null,
        },
      ],
    });

    expect(result).toEqual({
      status: "ACTIVE",
      activeRevisionId: "active",
      hasDraftChanges: true,
      hasScheduledRevision: true,
    });
  });

  it("applies archived and disabled precedence before revision schedules", () => {
    const activeRevision = published("active", "2026-09-20T00:00:00.000Z");

    expect(
      derivePromotionStatus({
        archivedAt: new Date("2026-09-22T00:00:00.000Z"),
        disabledAt: null,
        now,
        revisions: [activeRevision],
      }).status,
    ).toBe("ARCHIVED");
    expect(
      derivePromotionStatus({
        archivedAt: null,
        disabledAt: new Date("2026-09-23T00:00:00.000Z"),
        now,
        revisions: [activeRevision],
      }).status,
    ).toBe("DISABLED");
  });

  it("distinguishes scheduled, expired, and never-published promotions", () => {
    expect(
      derivePromotionStatus({
        archivedAt: null,
        disabledAt: null,
        now,
        revisions: [published("future", "2026-10-01T00:00:00.000Z")],
      }).status,
    ).toBe("SCHEDULED");
    expect(
      derivePromotionStatus({
        archivedAt: null,
        disabledAt: null,
        now,
        revisions: [published("old", "2026-09-01T00:00:00.000Z", "2026-09-20T00:00:00.000Z")],
      }).status,
    ).toBe("EXPIRED");
    expect(derivePromotionStatus({ archivedAt: null, disabledAt: null, now, revisions: [] }).status).toBe("DRAFT");
  });

  it("rejects overlapping active revisions instead of selecting one by accident", () => {
    expect(() =>
      derivePromotionStatus({
        archivedAt: null,
        disabledAt: null,
        now,
        revisions: [
          published("revision-1", "2026-09-01T00:00:00.000Z"),
          published("revision-2", "2026-09-20T00:00:00.000Z"),
        ],
      }),
    ).toThrow("more than one active published revision");
  });
});
