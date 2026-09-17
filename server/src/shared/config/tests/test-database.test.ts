import { describe, expect, it } from "vitest";

import {
  createTestWorkerDatabaseUrl,
  getTestWorkerSchema,
  INTEGRATION_WORKER_COUNT,
  requireTestDatabaseUrl,
  requireTestWorkerDatabaseUrl,
  type TestDatabaseEnvironment,
} from "../test-database.js";

const databaseUrl = "postgresql://eccommerce_test:eccommerce_test@localhost:5434/eccommerce_test";
const schemaPrefix = "test_0123456789abcdef0123456789abcdef";
const testEnvironment = { NODE_ENV: "test", TEST_DATABASE_URL: databaseUrl };

function workerEnvironment(): TestDatabaseEnvironment {
  return {
    ...testEnvironment,
    TEST_TYPE: "integration",
    TEST_DATABASE_SCHEMA_PREFIX: schemaPrefix,
    VITEST_POOL_ID: "1",
    TEST_DATABASE_WORKER_URL: createTestWorkerDatabaseUrl(testEnvironment, schemaPrefix, "1").toString(),
  };
}

describe("test database safety", () => {
  it.each(["development", "production", undefined])("rejects NODE_ENV=%s", (nodeEnv) => {
    expect(() => requireTestDatabaseUrl({ ...testEnvironment, NODE_ENV: nodeEnv })).toThrow("NODE_ENV=test");
  });

  it.each([undefined, "", "   "])("rejects a missing or empty test URL: %s", (connectionString) => {
    expect(() => requireTestDatabaseUrl({ NODE_ENV: "test", TEST_DATABASE_URL: connectionString })).toThrow(
      "require TEST_DATABASE_URL",
    );
  });

  it("never falls back to the development database URL", () => {
    const environment = { NODE_ENV: "test", DATABASE_URL: databaseUrl };
    expect(() => requireTestDatabaseUrl(environment)).toThrow("DATABASE_URL is never used as a fallback");
  });

  it.each(["not-a-url", "https://localhost/eccommerce_test", "postgresql:///eccommerce_test"])(
    "rejects an invalid PostgreSQL URL: %s",
    (connectionString) => {
      expect(() => requireTestDatabaseUrl({ ...testEnvironment, TEST_DATABASE_URL: connectionString })).toThrow(
        "valid PostgreSQL URL",
      );
    },
  );

  it.each(["eccommerce", "production", "contest", "latest", "", "test/other", "%E0%A4%A"])(
    "rejects an unsafe database name: %s",
    (databaseName) => {
      expect(() =>
        requireTestDatabaseUrl({ ...testEnvironment, TEST_DATABASE_URL: `postgresql://localhost/${databaseName}` }),
      ).toThrow();
    },
  );

  it.each(["eccommerce_test", "test_eccommerce", "eccommerce-test"])(
    "accepts a dedicated test database: %s",
    (databaseName) => {
      const result = requireTestDatabaseUrl({
        ...testEnvironment,
        TEST_DATABASE_URL: `postgresql://localhost/${databaseName}`,
      });
      expect(result.pathname).toBe(`/${databaseName}`);
    },
  );

  it("accepts the postgres protocol alias", () => {
    expect(
      requireTestDatabaseUrl({ ...testEnvironment, TEST_DATABASE_URL: "postgres://localhost/eccommerce_test" })
        .protocol,
    ).toBe("postgres:");
  });

  it("rejects URL options that can override the worker search path", () => {
    expect(() =>
      requireTestDatabaseUrl({
        ...testEnvironment,
        TEST_DATABASE_URL: `${databaseUrl}?options=-c%20search_path=public`,
      }),
    ).toThrow("must not override PostgreSQL connection options");
  });
});

describe("worker schema ownership", () => {
  it.each([undefined, "public", "test_worker", 'test_0123456789abcdef0123456789abcdef"; DROP SCHEMA public'])(
    "rejects an unowned or unsafe schema prefix: %s",
    (prefix) => {
      expect(() => getTestWorkerSchema(prefix, "1")).toThrow("test-run-owned schema prefix");
    },
  );

  it.each([undefined, "0", "-1", "1.5", "01", String(INTEGRATION_WORKER_COUNT + 1)])(
    "rejects an unprovisioned pool ID: %s",
    (poolId) => {
      expect(() => getTestWorkerSchema(schemaPrefix, poolId)).toThrow("provisioned integration worker");
    },
  );

  it("assigns different schemas to each worker and to simultaneous test runs", () => {
    const schemas = Array.from({ length: INTEGRATION_WORKER_COUNT }, (_, index) =>
      getTestWorkerSchema(schemaPrefix, String(index + 1)),
    );
    expect(new Set(schemas).size).toBe(INTEGRATION_WORKER_COUNT);
    expect(getTestWorkerSchema("test_fedcba9876543210fedcba9876543210", "1")).not.toBe(schemas[0]);
  });

  it("replaces a public schema parameter without changing the source URL", () => {
    const environment = { ...testEnvironment, TEST_DATABASE_URL: `${databaseUrl}?schema=public` };
    const result = createTestWorkerDatabaseUrl(environment, schemaPrefix, "1");
    expect(result.searchParams.get("schema")).toBe(`${schemaPrefix}_worker_1`);
    expect(environment.TEST_DATABASE_URL).toBe(`${databaseUrl}?schema=public`);
  });

  it("rejects Prisma access from unit workers even with inherited integration variables", () => {
    expect(() => requireTestWorkerDatabaseUrl({ ...workerEnvironment(), TEST_TYPE: "unit" })).toThrow(
      "requires the integration project",
    );
  });

  it("rejects a worker URL that has not been initialized", () => {
    expect(() => requireTestWorkerDatabaseUrl({ ...workerEnvironment(), TEST_DATABASE_WORKER_URL: undefined })).toThrow(
      "has not been configured",
    );
  });

  it("rejects a malformed worker URL", () => {
    expect(() =>
      requireTestWorkerDatabaseUrl({ ...workerEnvironment(), TEST_DATABASE_WORKER_URL: "not-a-url" }),
    ).toThrow("worker database URL is invalid");
  });

  it.each([
    "postgresql://localhost/eccommerce?schema=public",
    `${databaseUrl}?schema=public`,
    `${databaseUrl}?schema=${schemaPrefix}_worker_2`,
    `postgresql://other-host/eccommerce_test?schema=${schemaPrefix}_worker_1`,
  ])("rejects a connection outside the current worker: %s", (workerUrl) => {
    expect(() => requireTestWorkerDatabaseUrl({ ...workerEnvironment(), TEST_DATABASE_WORKER_URL: workerUrl })).toThrow(
      "must match the configured test database and current worker schema",
    );
  });

  it("accepts exactly the current worker connection", () => {
    const environment = workerEnvironment();
    expect(requireTestWorkerDatabaseUrl(environment).toString()).toBe(environment.TEST_DATABASE_WORKER_URL);
  });
});
