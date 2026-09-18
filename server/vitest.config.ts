import { defineConfig } from "vitest/config";

import { INTEGRATION_WORKER_COUNT } from "./src/shared/config/test-database.js";

const junitOutputFile = process.env["VITEST_JUNIT_OUTPUT_FILE"];

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: INTEGRATION_WORKER_COUNT,
        isolate: true,
      },
    },
    fileParallelism: true,
    teardownTimeout: 30_000,
    reporters: junitOutputFile ? ["default", ["junit", { includeConsoleOutput: false }]] : ["default"],
    outputFile: junitOutputFile ? { junit: junitOutputFile } : undefined,
  },
});
