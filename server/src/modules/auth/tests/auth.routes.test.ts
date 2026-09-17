import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/db/prisma.js";
import { CSRF_HEADER_NAME } from "../../../shared/middleware/csrf.js";
import { SESSION_COOKIE_NAME } from "../../../shared/middleware/session.js";
import { hashPassword } from "../auth.password.js";

const registerEmail = "register.customer@example.com";
const loginEmail = "login.customer@example.com";
const testEmails = [registerEmail, loginEmail];

describe("auth routes", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });
  });

  it("registers a customer and starts a session", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: ` ${registerEmail.toUpperCase()} `,
        name: "Register Customer",
        password: "Register123!",
      })
      .expect(201);

    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.body.user).toMatchObject({
      email: registerEmail,
      name: "Register Customer",
      roles: [],
    });
    expect(response.body.user.id).toEqual(expect.any(String));
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it("rejects duplicate email registration", async () => {
    await prisma.user.create({
      data: {
        email: registerEmail,
        name: "Existing Customer",
        passwordHash: "test-password-hash",
      },
    });

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: registerEmail,
        name: "Duplicate Customer",
        password: "Register123!",
      })
      .expect(409);

    expect(response.body.error.message).toBe("An account with this email already exists.");
  });

  it("logs in a customer and starts a session", async () => {
    await prisma.user.create({
      data: {
        email: loginEmail,
        name: "Login Customer",
        passwordHash: await hashPassword("Login123!"),
      },
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: ` ${loginEmail.toUpperCase()} `,
        password: "Login123!",
      })
      .expect(200);

    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.body.user).toMatchObject({
      email: loginEmail,
      name: "Login Customer",
      roles: [],
    });
    expect(response.body.user.id).toEqual(expect.any(String));
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it("rejects invalid login credentials", async () => {
    await prisma.user.create({
      data: {
        email: loginEmail,
        name: "Login Customer",
        passwordHash: await hashPassword("Login123!"),
      },
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: loginEmail,
        password: "Wrong123!",
      })
      .expect(401);

    expect(response.body.error.message).toBe("Invalid email or password.");
  });

  it("returns the current session user", async () => {
    await prisma.user.create({
      data: {
        email: loginEmail,
        name: "Login Customer",
        passwordHash: await hashPassword("Login123!"),
      },
    });

    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({
        email: loginEmail,
        password: "Login123!",
      })
      .expect(200);

    const response = await agent.get("/api/auth/me").expect(200);

    expect(response.body.user).toMatchObject({
      email: loginEmail,
      name: "Login Customer",
      roles: [],
    });
    expect(response.body.user.id).toEqual(expect.any(String));
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it("returns null when there is no current session user", async () => {
    const response = await request(app).get("/api/auth/me").expect(200);

    expect(response.body).toEqual({ user: null });
  });

  it("returns a CSRF token for the current session user", async () => {
    await prisma.user.create({
      data: {
        email: loginEmail,
        name: "Login Customer",
        passwordHash: await hashPassword("Login123!"),
      },
    });

    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({
        email: loginEmail,
        password: "Login123!",
      })
      .expect(200);

    const response = await agent.get("/api/auth/csrf-token").expect(200);

    expect(response.body.csrfToken).toEqual(expect.any(String));
  });

  it("rejects CSRF token requests without a session user", async () => {
    const response = await request(app).get("/api/auth/csrf-token").expect(401);

    expect(response.body.error.message).toBe("Authentication required.");
  });

  it("logs out a customer and clears the session cookie", async () => {
    await prisma.user.create({
      data: {
        email: loginEmail,
        name: "Login Customer",
        passwordHash: await hashPassword("Login123!"),
      },
    });

    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({
        email: loginEmail,
        password: "Login123!",
      })
      .expect(200);

    const tokenResponse = await agent.get("/api/auth/csrf-token").expect(200);

    const response = await agent
      .post("/api/auth/logout")
      .set(CSRF_HEADER_NAME, tokenResponse.body.csrfToken)
      .expect(204);
    const setCookie = response.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];

    expect(cookies.some((cookie) => cookie?.startsWith(`${SESSION_COOKIE_NAME}=`) && cookie.includes("Expires="))).toBe(
      true,
    );
  });

  it("rejects logout without a CSRF token", async () => {
    await prisma.user.create({
      data: {
        email: loginEmail,
        name: "Login Customer",
        passwordHash: await hashPassword("Login123!"),
      },
    });

    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({
        email: loginEmail,
        password: "Login123!",
      })
      .expect(200);

    const response = await agent.post("/api/auth/logout").expect(403);

    expect(response.body.error.message).toBe("Invalid CSRF token.");
  });

  it("rejects logout with an invalid CSRF token", async () => {
    await prisma.user.create({
      data: {
        email: loginEmail,
        name: "Login Customer",
        passwordHash: await hashPassword("Login123!"),
      },
    });

    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({
        email: loginEmail,
        password: "Login123!",
      })
      .expect(200);
    await agent.get("/api/auth/csrf-token").expect(200);

    const response = await agent.post("/api/auth/logout").set(CSRF_HEADER_NAME, "invalid-token").expect(403);

    expect(response.body.error.message).toBe("Invalid CSRF token.");
  });
});
