import { app } from "./app.js";
import { env } from "./shared/config/env.js";

const server = app.listen(env.PORT, () => {
  console.log(`API server listening on http://localhost:${env.PORT}`);
});

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`${signal} received. Closing API server.`);
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
