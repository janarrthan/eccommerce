import "dotenv/config";

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { GlobalSetupContext } from "vitest/node";

import {
  createTestWorkerDatabaseUrl,
  getTestWorkerSchema,
  INTEGRATION_WORKER_COUNT,
  requireTestDatabaseUrl,
} from "../config/test-database.js";
import { createTestDatabasePool, dropTestWorkerSchemas } from "./test-database-lifecycle.js";

const executeFile = promisify(execFile);
const require = createRequire(import.meta.url);
const serverDirectory = fileURLToPath(new URL("../../../", import.meta.url));

export default async function setup({ provide }: GlobalSetupContext) {
  const databaseUrl = requireTestDatabaseUrl(process.env).toString();
  const environment = { NODE_ENV: "test", TEST_DATABASE_URL: databaseUrl };
  const schemaPrefix = `test_${randomUUID().replaceAll("-", "")}`;
  const createdPoolIds: string[] = [];
  const pool = createTestDatabasePool(environment);

  try {
    for (let worker = 1; worker <= INTEGRATION_WORKER_COUNT; worker += 1) {
      const poolId = String(worker);
      const schema = getTestWorkerSchema(schemaPrefix, poolId);
      const workerUrl = createTestWorkerDatabaseUrl(environment, schemaPrefix, poolId).toString();

      await pool.query(`CREATE SCHEMA "${schema}"`);
      createdPoolIds.push(poolId);

      // Apply migrations to one worker schema at a time. Prisma uses a database-wide advisory lock,
      // so parallel migration commands would block each other while waiting for the same lock.
      await executeFile(
        process.execPath,
        [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--config", "prisma.test.config.ts"],
        {
          cwd: serverDirectory,
          env: {
            ...process.env,
            NODE_ENV: "test",
            TEST_TYPE: "integration",
            TEST_DATABASE_URL: databaseUrl,
            TEST_DATABASE_SCHEMA_PREFIX: schemaPrefix,
            TEST_DATABASE_WORKER_URL: workerUrl,
            VITEST_POOL_ID: poolId,
          },
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
    }

    provide("testDatabase", { databaseUrl, schemaPrefix });
  } catch (error) {
    try {
      await dropTestWorkerSchemas(pool, schemaPrefix, createdPoolIds);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Integration database setup and cleanup both failed.");
    }

    throw error;
  } finally {
    await pool.end();
  }

  return async () => {
    const cleanupPool = createTestDatabasePool(environment);

    try {
      await dropTestWorkerSchemas(cleanupPool, schemaPrefix, createdPoolIds);
    } finally {
      await cleanupPool.end();
    }
  };
}
