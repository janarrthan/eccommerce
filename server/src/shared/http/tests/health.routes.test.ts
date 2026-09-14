import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../../app.js";

describe("health routes", () => {
  it("returns API health status", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "eccommerce-api",
    });
  });
});
