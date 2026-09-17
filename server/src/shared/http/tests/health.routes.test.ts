import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../../app.js";

describe("application health routes", () => {
  it.each(["/health", "/api/health"])("exposes API health status at %s", async (path) => {
    const response = await request(app).get(path).expect(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "eccommerce-api",
    });
  });
});
