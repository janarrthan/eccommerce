import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../../../app.js";
import { errorHandler } from "../error-handler.js";
import { healthRouter } from "../health.routes.js";
import { createReadinessRouter } from "../readiness.routes.js";

function createOperationalTestApp(checkDatabase: () => Promise<void>) {
  const testApp = express();

  testApp.use("/health", healthRouter);
  testApp.use("/ready", createReadinessRouter(checkDatabase));
  testApp.use(errorHandler);

  return testApp;
}

describe("application readiness routes", () => {
  it.each(["/ready", "/api/ready"])("reports database readiness at %s", async (path) => {
    const response = await request(app).get(path).expect(200);

    expect(response.body).toEqual({
      status: "ready",
      service: "eccommerce-api",
    });
  });

  it("does not execute the database readiness check for liveness", async () => {
    const checkDatabase = vi.fn(async () => {
      throw new Error("The liveness route must not execute this check.");
    });

    const testApp = createOperationalTestApp(checkDatabase);

    const response = await request(testApp).get("/health").expect(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "eccommerce-api",
    });

    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it("returns a generic failure without leaking database details when readiness fails", async () => {
    const sensitiveDatabaseError = "password=do-not-leak host=private-database.internal";

    const checkDatabase = vi.fn(async () => {
      throw new Error(sensitiveDatabaseError);
    });

    const testApp = createOperationalTestApp(checkDatabase);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await request(testApp).get("/ready").expect(500);

      expect(checkDatabase).toHaveBeenCalledOnce();
      expect(response.body).toEqual({
        error: {
          message: "Internal server error.",
        },
      });
      expect(JSON.stringify(response.body)).not.toContain(sensitiveDatabaseError);
    } finally {
      consoleError.mockRestore();
    }
  });
});
