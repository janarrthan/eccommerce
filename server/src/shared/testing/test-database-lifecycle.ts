import { Pool } from "pg";

import {
  getTestWorkerSchema,
  requireTestDatabaseUrl,
  requireTestWorkerDatabaseUrl,
  type TestDatabaseEnvironment,
} from "../config/test-database.js";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function createTestDatabasePool(environment: TestDatabaseEnvironment): Pool {
  const url = requireTestDatabaseUrl(environment);
  url.searchParams.delete("schema");

  return new Pool({
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    query_timeout: 15_000,
    idleTimeoutMillis: 1_000,
  });
}

export async function dropTestWorkerSchemas(
  pool: Pool,
  schemaPrefix: string,
  poolIds: readonly string[],
): Promise<void> {
  const errors: unknown[] = [];

  for (const poolId of poolIds) {
    const schema = getTestWorkerSchema(schemaPrefix, poolId);

    try {
      await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "Unable to remove every test-owned worker schema.");
  }
}

export async function resetTestWorkerSchema(environment: TestDatabaseEnvironment): Promise<void> {
  const workerUrl = requireTestWorkerDatabaseUrl(environment);
  const schema = workerUrl.searchParams.get("schema")!;
  const pool = createTestDatabasePool(environment);

  try {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_type = 'BASE TABLE'
         AND table_name <> '_prisma_migrations'
       ORDER BY table_name`,
      [schema],
    );

    if (rows.length === 0) {
      throw new Error("The integration worker schema has no migrated application tables.");
    }

    const tables = rows.map(({ table_name }) => `${quoteIdentifier(schema)}.${quoteIdentifier(table_name)}`);

    // Clear only this worker's tables without the use of CASCADE. PostgreSQL stops with an error
    // if a table outside this list has a foreign key pointing to one of these tables.
    await pool.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY`);
  } finally {
    await pool.end();
  }
}
