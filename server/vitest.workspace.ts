import { defineWorkspace } from "vitest/config";

const unitTests = [
  "src/**/*.unit.test.ts",
  "src/**/*.logic.test.ts",
  "src/**/*.validation.test.ts",
  "src/shared/config/tests/test-database.test.ts",
  "src/shared/middleware/tests/authenticated.test.ts",
];

export default defineWorkspace([
  {
    test: {
      name: "unit",
      environment: "node",
      pool: "forks",
      setupFiles: ["src/shared/testing/unit.setup.ts"],
      include: unitTests,
    },
  },
  {
    test: {
      name: "integration",
      environment: "node",
      pool: "forks",
      include: ["src/**/*.test.ts"],
      exclude: unitTests,
      globalSetup: ["src/shared/testing/database.global-setup.ts"],
      setupFiles: ["src/shared/testing/integration.setup.ts"],
      hookTimeout: 30_000,
      testTimeout: 15_000,
      sequence: { hooks: "stack" },
    },
  },
]);
