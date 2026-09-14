import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../../shared/db/prisma.js";
import { errorHandler } from "../../../shared/http/error-handler.js";
import { createSessionMiddleware } from "../../../shared/middleware/session.js";
import { PERMISSION_CODES } from "../authorization.constants.js";
import {
  requireAdminAccess,
  requirePermission,
} from "../authorization.middleware.js";

const adminEmail = "authorization.admin@example.com";
const customerEmail = "authorization.customer@example.com";
const testRoleCode = "TEST_ADMIN";

let adminUserId = "";
let customerUserId = "";

function createTestApp() {
  const app = express();

  app.use(createSessionMiddleware());

  app.post("/test-login/:accountType", (req, res) => {
    const isAdmin = req.params.accountType === "admin";

    req.session.user = {
      id: isAdmin ? adminUserId : customerUserId,
      email: isAdmin ? adminEmail : customerEmail,
    };

    res.status(204).send();
  });

  app.get("/admin", requireAdminAccess, (_req, res) => {
    res.status(200).json({ authorization: res.locals.authorization });
  });

  app.get(
    "/catalog",
    requirePermission(PERMISSION_CODES.CATALOG_READ),
    (_req, res) => {
      res.status(200).json({ authorization: res.locals.authorization });
    },
  );

  app.use(errorHandler);

  return app;
}

describe("database authorization middleware", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, customerEmail] } },
    });
    await prisma.role.deleteMany({ where: { code: testRoleCode } });

    const permission = await prisma.permission.upsert({
      where: { code: PERMISSION_CODES.CATALOG_READ },
      update: {},
      create: {
        code: PERMISSION_CODES.CATALOG_READ,
        name: "View catalog",
      },
    });
    const role = await prisma.role.create({
      data: {
        code: testRoleCode,
        name: "Test admin",
        rolePermissions: {
          create: { permissionId: permission.id },
        },
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Authorization Admin",
        passwordHash: "test-password-hash",
        roleAssignments: {
          create: { roleId: role.id },
        },
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: customerEmail,
        name: "Authorization Customer",
        passwordHash: "test-password-hash",
      },
    });

    adminUserId = admin.id;
    customerUserId = customer.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, customerEmail] } },
    });
    await prisma.role.deleteMany({ where: { code: testRoleCode } });
    await prisma.$disconnect();
  });

  it("rejects requests without a session user", async () => {
    const response = await request(createTestApp()).get("/admin").expect(401);

    expect(response.body.error.message).toBe("Authentication required.");
  });

  it("rejects users without an assigned administrative role", async () => {
    const agent = request.agent(createTestApp());

    await agent.post("/test-login/customer").expect(204);

    const response = await agent.get("/admin").expect(403);

    expect(response.body.error.message).toBe("Admin access required.");
  });

  it("loads roles and permissions from the database", async () => {
    const agent = request.agent(createTestApp());

    await agent.post("/test-login/admin").expect(204);

    const response = await agent.get("/catalog").expect(200);

    expect(response.body.authorization).toMatchObject({
      userId: adminUserId,
      roleCodes: [testRoleCode],
      permissionCodes: [PERMISSION_CODES.CATALOG_READ],
    });
  });
});
