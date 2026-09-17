import { defineConfig } from "vitest/config";

import { INTEGRATION_WORKER_COUNT } from "./src/shared/config/test-database.js";

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
  },
});
