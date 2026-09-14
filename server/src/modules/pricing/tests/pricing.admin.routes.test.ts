import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/db/prisma.js";
import { CSRF_HEADER_NAME } from "../../../shared/middleware/csrf.js";
import { PERMISSION_CODES } from "../../authorization/authorization.constants.js";
import { COMMERCE_SETTINGS_ID } from "../pricing.constants.js";

const email = "pricing.admin@example.com";
const roleCode = "TEST_PRICING_ADMIN";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.role.deleteMany({ where: { code: roleCode } });
}

async function createAgent(withPermissions = true) {
  const agent = request.agent(app);
  const registration = await agent
    .post("/api/auth/register")
    .send({
      email,
      name: "Pricing Admin",
      password: "PricingPass123!",
    })
    .expect(201);

  if (withPermissions) {
    const permissions = await Promise.all(
      [PERMISSION_CODES.SETTINGS_READ, PERMISSION_CODES.SETTINGS_WRITE].map((code) =>
        prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code, name: code },
        }),
      ),
    );
    const role = await prisma.role.create({
      data: {
        code: roleCode,
        name: "Pricing administrator",
        rolePermissions: {
          create: permissions.map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: registration.body.user.id, roleId: role.id },
    });
  }

  const token = await agent.get("/api/auth/csrf-token").expect(200);
  return { agent, csrfToken: token.body.csrfToken as string };
}

const settingsBody = {
  baseCurrency: "USD",
  currencies: [
    { code: "USD", minorUnitDigits: 2 },
    { code: "EUR", minorUnitDigits: 2 },
    { code: "LKR", minorUnitDigits: 2 },
  ],
  rateTtlMinutes: 1440,
};

describe("pricing administration", () => {
  beforeEach(async () => {
    await cleanup();
    await prisma.commerceCurrency.upsert({
      where: { code: "USD" },
      update: { minorUnitDigits: 2, isEnabled: true },
      create: { code: "USD", minorUnitDigits: 2, isEnabled: true },
    });
    await prisma.commerceSettings.upsert({
      where: { id: COMMERCE_SETTINGS_ID },
      update: { baseCurrencyCode: "USD", rateTtlMinutes: 1440 },
      create: { id: COMMERCE_SETTINGS_ID, baseCurrencyCode: "USD", rateTtlMinutes: 1440 },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires settings permissions and CSRF protection", async () => {
    await request(app).get("/api/admin/pricing").expect(401);
    await request(app).put("/api/admin/pricing/settings").send(settingsBody).expect(401);

    const { agent, csrfToken } = await createAgent(false);
    await agent.get("/api/admin/pricing").expect(403);
    await agent.put("/api/admin/pricing/settings").set(CSRF_HEADER_NAME, csrfToken).send(settingsBody).expect(403);
  });

  it("configures currencies and exposes only enabled currencies to the storefront", async () => {
    const { agent, csrfToken } = await createAgent();
    const saved = await agent
      .put("/api/admin/pricing/settings")
      .set(CSRF_HEADER_NAME, csrfToken)
      .send(settingsBody)
      .expect(200);

    expect(saved.body.pricing).toMatchObject({
      baseCurrency: "USD",
      rateTtlMinutes: 1440,
      currencies: expect.arrayContaining([
        { code: "USD", minorUnitDigits: 2, isEnabled: true },
        { code: "EUR", minorUnitDigits: 2, isEnabled: true },
        { code: "LKR", minorUnitDigits: 2, isEnabled: true },
      ]),
    });
    const read = await agent.get("/api/admin/pricing").expect(200);
    expect(read.body).toEqual(saved.body);

    const storefront = await request(app).get("/api/storefront/pricing").expect(200);
    expect(storefront.body.pricing).toEqual({
      baseCurrency: "USD",
      currencies: [
        { code: "EUR", minorUnitDigits: 2 },
        { code: "LKR", minorUnitDigits: 2 },
        { code: "USD", minorUnitDigits: 2 },
      ],
    });
  });

  it("stores precise provider rates with server-controlled freshness timestamps", async () => {
    const { agent, csrfToken } = await createAgent();
    await agent.put("/api/admin/pricing/settings").set(CSRF_HEADER_NAME, csrfToken).send(settingsBody).expect(200);
    const before = Date.now();
    const saved = await agent
      .put("/api/admin/pricing/exchange-rates")
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({
        provider: "test-provider",
        rates: [
          { quoteCurrency: "EUR", rate: "0.920000000000" },
          { quoteCurrency: "LKR", rate: "305.500000000000" },
        ],
      })
      .expect(200);

    const euroRate = saved.body.pricing.exchangeRates.find(
      ({ quoteCurrencyCode }: { quoteCurrencyCode: string }) => quoteCurrencyCode === "EUR",
    );
    expect(euroRate).toMatchObject({
      baseCurrencyCode: "USD",
      quoteCurrencyCode: "EUR",
      rate: "0.92",
      provider: "test-provider",
    });
    expect(new Date(euroRate.fetchedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(euroRate.expiresAt).getTime() - new Date(euroRate.fetchedAt).getTime()).toBe(86_400_000);
  });

  it("rejects invalid rates and currencies outside the enabled set", async () => {
    const { agent, csrfToken } = await createAgent();
    await agent.put("/api/admin/pricing/settings").set(CSRF_HEADER_NAME, csrfToken).send(settingsBody).expect(200);

    await agent
      .put("/api/admin/pricing/exchange-rates")
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ provider: "test-provider", rates: [{ quoteCurrency: "EUR", rate: 0.92 }] })
      .expect(400);
    await agent
      .put("/api/admin/pricing/exchange-rates")
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ provider: "test-provider", rates: [{ quoteCurrency: "GBP", rate: "0.8" }] })
      .expect(400);
  });
});
