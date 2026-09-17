import { afterAll, beforeAll, inject } from "vitest";

import { createTestWorkerDatabaseUrl } from "../config/test-database.js";
import { resetTestWorkerSchema } from "./test-database-lifecycle.js";

const configuration = inject("testDatabase");

process.env.TEST_TYPE = "integration";
process.env.TEST_DATABASE_URL = configuration.databaseUrl;
process.env.TEST_DATABASE_SCHEMA_PREFIX = configuration.schemaPrefix;
process.env.TEST_DATABASE_WORKER_URL = createTestWorkerDatabaseUrl(
  process.env,
  configuration.schemaPrefix,
  process.env.VITEST_POOL_ID,
).toString();

// Import Prisma after configuring this worker's connection because prisma.ts creates its client during
// the import. This order ensures that the client connects to the current worker's schema.
const { prisma } = await import("../db/prisma.js");

// Vitest can reuse one worker for several test files. Clear this worker's application tables before
// each file so records from the previous file cannot affect the next file.
beforeAll(async () => {
  await resetTestWorkerSchema(process.env);
});

// Vitest runs afterAll hooks in reverse registration order because this project uses stack ordering.
// The test file removes its fixtures first, and this shared hook disconnects Prisma afterward.
afterAll(async () => {
  await prisma.$disconnect();
});
