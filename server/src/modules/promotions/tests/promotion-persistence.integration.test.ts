import { describe, expect, it } from "vitest";

import { prisma } from "../../../shared/db/prisma.js";
import { expectPostgresRejection } from "../../../shared/testing/postgres-error.js";

/**
 * Requires a PostgreSQL integrity failure, such as rejecting a code limit of six.
 *
 * These tests deliberately use SQL rather than new generated delegates so the test source can be type-checked
 * before the user generates Prisma Client. The shared integration setup still owns connections and worker schemas.
 */
async function expectDatabaseRejection(
  sql: string,
  parameters: readonly unknown[] = [],
  expectedCode = "23514",
): Promise<void> {
  await expectPostgresRejection(
    prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(sql, ...parameters);
      // Deferred aggregate guards must also run before a test can report success.
      await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      // Roll back even if a missing guard accepts the invalid write. Otherwise that row could make the next
      // test fail for a uniqueness conflict and hide the missing check.
      throw new Error("The database accepted a write that should have been rejected.");
    }),
    expectedCode,
  );
}

describe("promotion persistence integrity", () => {
  it.each([
    ["AUTOMATIC", "SAVE20", "23514"],
    ["DISCOUNT_CODE", null, "23514"],
    ["DISCOUNT_CODE", "save20", "23514"],
    ["DISCOUNT_CODE", "SHORT", "23514"],
    ["DISCOUNT_CODE", "CODE WITH SPACE", "23514"],
    // VARCHAR(16) rejects 17 characters before the activation CHECK can run.
    ["DISCOUNT_CODE", "ABCDEFGHIJKLMNOPQ", "22001"],
  ] as const)("rejects activation method %s with code %s on the promotion row", async (method, code, expectedCode) => {
    await expectDatabaseRejection(
      'INSERT INTO "Promotion" ("id", "internalName", "benefitType", "activationMethod", "normalizedCode", "updatedAt") VALUES ($1, $2, $3::"PromotionBenefitType", $4::"PromotionActivationMethod", $5, NOW())',
      ["promotion-integrity-invalid-code", "Invalid code fixture", "ORDER_DISCOUNT", method, code],
      expectedCode,
    );
  });

  it("rejects duplicate normalized codes directly on promotion rows", async () => {
    await expectPostgresRejection(
      prisma.$transaction(async (transaction) => {
        for (const id of ["promotion-integrity-code-first", "promotion-integrity-code-second"]) {
          await transaction.$executeRawUnsafe(
            'INSERT INTO "Promotion" ("id", "internalName", "benefitType", "activationMethod", "normalizedCode", "updatedAt") VALUES ($1, $2, $3::"PromotionBenefitType", $4::"PromotionActivationMethod", $5, NOW())',
            id,
            "Duplicate code fixture",
            "ORDER_DISCOUNT",
            "DISCOUNT_CODE",
            "SAVE20",
          );
        }
        throw new Error("The database accepted a duplicate promotion code.");
      }),
      "23505",
    );
  });

  it.each([1, 2, 3, 4, 5])("accepts the valid code limit %i", async (maximum) => {
    const rollback = new Error("Roll back the valid settings fixture.");
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          'INSERT INTO "PromotionSettings" ("id", "maximumCodesPerCart", "updatedAt") VALUES ($1, $2, NOW())',
          "default",
          maximum,
        );
        await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it.each([0, 6])("rejects a code limit of %i at the database boundary", async (maximum) => {
    await expectDatabaseRejection(
      'INSERT INTO "PromotionSettings" ("id", "maximumCodesPerCart", "updatedAt") VALUES ($1, $2, NOW())',
      ["default", maximum],
    );
  });

  it("rejects a second singleton settings identity", async () => {
    await expectDatabaseRejection(
      'INSERT INTO "PromotionSettings" ("id", "maximumCodesPerCart", "updatedAt") VALUES ($1, 1, NOW())',
      ["promotion-integrity-other-settings"],
    );
  });

  it.each(["UPDATE", "DELETE"] as const)("rejects %s of an existing promotion audit event", async (operation) => {
    const eventId = `promotion-integrity-audit-${operation.toLowerCase()}`;
    await prisma.$executeRawUnsafe(
      'INSERT INTO "PromotionAuditEvent" ("id", "promotionId", "actorUserId", "action", "correlationId", "changeSummary") VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      eventId,
      "promotion-integrity-deleted-draft",
      "promotion-integrity-former-actor",
      "draft.deleted",
      "promotion-integrity-correlation",
      JSON.stringify({ internalName: "Integrity test draft" }),
    );

    const sql =
      operation === "UPDATE"
        ? 'UPDATE "PromotionAuditEvent" SET "reason" = $1 WHERE "id" = $2'
        : 'DELETE FROM "PromotionAuditEvent" WHERE "id" = $1';
    await expectDatabaseRejection(sql, operation === "UPDATE" ? ["Rewritten history", eventId] : [eventId]);

    const events = await prisma.$queryRawUnsafe<readonly { id: string }[]>(
      'SELECT "id" FROM "PromotionAuditEvent" WHERE "id" = $1',
      eventId,
    );
    expect(events).toEqual([{ id: eventId }]);
    // The shared worker reset truncates these test-owned events before the next file. Individual tests must not
    // delete append-only evidence merely to clean up; doing so would bypass the boundary being tested.
  });
});
