import { Router } from "express";

import { prisma } from "../db/prisma.js";
import { asyncHandler } from "./async-handler.js";

type DatabaseReadinessCheck = () => Promise<void>;

async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
}

export function createReadinessRouter(checkDatabase: DatabaseReadinessCheck = checkDatabaseConnection) {
  const readinessRouter = Router();

  readinessRouter.get(
    "/",
    asyncHandler(async (_req, res) => {
      await checkDatabase();

      res.status(200).json({
        status: "ready",
        service: "eccommerce-api",
      });
    }),
  );

  return readinessRouter;
}

export const readinessRouter = createReadinessRouter();
