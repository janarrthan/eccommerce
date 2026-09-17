export type TestDatabaseEnvironment = {
  NODE_ENV?: string;
  TEST_DATABASE_URL?: string;
  TEST_TYPE?: string;
  TEST_DATABASE_WORKER_URL?: string;
  TEST_DATABASE_SCHEMA_PREFIX?: string;
  VITEST_POOL_ID?: string;
};

export const INTEGRATION_WORKER_COUNT = 4;

const TEST_DATABASE_NAME_PATTERN = /(?:^|[_-])test(?:$|[_-])/i;
const TEST_SCHEMA_PREFIX_PATTERN = /^test_[a-f0-9]{32}$/;

export function requireTestDatabaseUrl(environment: TestDatabaseEnvironment): URL {
  if (environment.NODE_ENV !== "test") {
    throw new Error("Database tests require NODE_ENV=test.");
  }

  const connectionString = environment.TEST_DATABASE_URL;

  if (!connectionString?.trim()) {
    throw new Error("Database tests require TEST_DATABASE_URL. DATABASE_URL is never used as a fallback.");
  }

  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname) {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (url.searchParams.has("options")) {
    throw new Error("TEST_DATABASE_URL must not override PostgreSQL connection options or the worker search path.");
  }

  let databaseName: string;

  try {
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("TEST_DATABASE_URL contains an invalid database name.");
  }

  if (!/^[a-z0-9_-]+$/i.test(databaseName) || !TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error("TEST_DATABASE_URL must identify a dedicated test database, such as eccommerce_test.");
  }

  return url;
}

export function getTestWorkerSchema(schemaPrefix: string | undefined, poolId: string | undefined): string {
  if (!schemaPrefix || !TEST_SCHEMA_PREFIX_PATTERN.test(schemaPrefix)) {
    throw new Error("A test-run-owned schema prefix is required.");
  }

  if (!poolId || !/^[1-9]\d*$/.test(poolId) || Number(poolId) > INTEGRATION_WORKER_COUNT) {
    throw new Error(`VITEST_POOL_ID must identify a provisioned integration worker (1-${INTEGRATION_WORKER_COUNT}).`);
  }

  return `${schemaPrefix}_worker_${poolId}`;
}

export function createTestWorkerDatabaseUrl(
  environment: TestDatabaseEnvironment,
  schemaPrefix: string | undefined,
  poolId: string | undefined,
): URL {
  const url = requireTestDatabaseUrl(environment);
  url.searchParams.set("schema", getTestWorkerSchema(schemaPrefix, poolId));
  return url;
}

export function requireTestWorkerDatabaseUrl(environment: TestDatabaseEnvironment): URL {
  if (environment.TEST_TYPE !== "integration") {
    throw new Error("Prisma access in tests requires the integration project and its isolated worker setup.");
  }

  const expectedUrl = createTestWorkerDatabaseUrl(
    environment,
    environment.TEST_DATABASE_SCHEMA_PREFIX,
    environment.VITEST_POOL_ID,
  );

  if (!environment.TEST_DATABASE_WORKER_URL) {
    throw new Error("The integration worker database URL has not been configured.");
  }

  let actualUrl: URL;

  try {
    actualUrl = new URL(environment.TEST_DATABASE_WORKER_URL);
  } catch {
    throw new Error("The integration worker database URL is invalid.");
  }

  if (actualUrl.toString() !== expectedUrl.toString()) {
    throw new Error("The integration connection must match the configured test database and current worker schema.");
  }

  return actualUrl;
}
