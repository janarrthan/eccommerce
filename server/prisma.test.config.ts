import { defineConfig } from "prisma/config";

import { requireTestWorkerDatabaseUrl } from "./src/shared/config/test-database.js";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: requireTestWorkerDatabaseUrl(process.env).toString(),
  },
});
