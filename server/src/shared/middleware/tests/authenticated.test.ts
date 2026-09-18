import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../../http/error-handler.js";
import { requireAuthenticated } from "../authenticated.js";
import { createSessionMiddleware } from "../session.js";

function createTestApp() {
  const app = express();

  app.use(createSessionMiddleware());

  app.post("/test-login", (req, res) => {
    req.session.user = {
      id: "test-user-id",
      email: "customer@example.com",
    };

    res.status(204).send();
  });

  app.get("/protected", requireAuthenticated, (req, res) => {
    res.status(200).json({ user: req.session.user });
  });

  app.use(errorHandler);

  return app;
}

describe("requireAuthenticated", () => {
  it("rejects requests without a session user", async () => {
    const response = await request(createTestApp()).get("/protected").expect(401);

    expect(response.body.error.message).toBe("Authentication required.");
  });

  it("allows requests with a session user", async () => {
    const agent = request.agent(createTestApp());

    await agent.post("/test-login").expect(204);

    const response = await agent.get("/protected").expect(200);

    expect(response.body.user).toEqual({
      id: "test-user-id",
      email: "customer@example.com",
    });
  });
});
