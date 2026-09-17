import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import {
  getTestWorkerSchema,
  INTEGRATION_WORKER_COUNT,
  requireTestWorkerDatabaseUrl,
} from "../../config/test-database.js";
import { prisma } from "../../db/prisma.js";

const userId = `test-database-infrastructure-user-${randomUUID()}`;

describe("integration database isolation", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("uses the dedicated database and worker search path for raw queries", async () => {
    const workerUrl = requireTestWorkerDatabaseUrl(process.env);
    const rows = await prisma.$queryRaw<{ database: string; schema: string; search_path: string[] }[]>`
      SELECT current_database()::text AS database,
             current_schema()::text AS schema,
             current_schemas(false)::text[] AS search_path
    `;

    expect(rows).toEqual([
      {
        database: decodeURIComponent(workerUrl.pathname.slice(1)),
        schema: workerUrl.searchParams.get("schema"),
        search_path: [workerUrl.searchParams.get("schema")],
      },
    ]);
  });

  it("has applied the migration history to every provisioned worker schema", async () => {
    const schemas = Array.from({ length: INTEGRATION_WORKER_COUNT }, (_, index) =>
      getTestWorkerSchema(process.env.TEST_DATABASE_SCHEMA_PREFIX, String(index + 1)),
    );

    const rows = await prisma.$queryRaw<{ table_schema: string }[]>`
      SELECT table_schema::text AS table_schema
      FROM information_schema.tables
      WHERE table_name = '_prisma_migrations'
    `;

    expect(rows.map(({ table_schema }) => table_schema)).toEqual(expect.arrayContaining(schemas));
  });

  it("writes through Prisma and reads from the current worker schema with raw SQL", async () => {
    const expectedSchema = getTestWorkerSchema(process.env.TEST_DATABASE_SCHEMA_PREFIX, process.env.VITEST_POOL_ID);

    await prisma.user.create({
      data: {
        id: userId,
        email: "test.database.infrastructure@example.com",
        name: "Database Infrastructure Fixture",
        passwordHash: "test-owned-password-hash",
      },
    });

    const rows = await prisma.$queryRaw<{ id: string; schema: string }[]>`
      SELECT id,
             current_schema()::text AS schema
      FROM "User"
      WHERE id = ${userId}
    `;

    expect(rows).toEqual([{ id: userId, schema: expectedSchema }]);
  });
});
