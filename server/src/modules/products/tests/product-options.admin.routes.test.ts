import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/db/prisma.js";
import { CSRF_HEADER_NAME } from "../../../shared/middleware/csrf.js";
import { PERMISSION_CODES } from "../../authorization/authorization.constants.js";
import { COMMERCE_SETTINGS_ID } from "../../pricing/pricing.constants.js";
import type { ProductOptionsInput } from "../product-options.validation.js";

const slug = "test-options-admin-hoodie";
const email = "options.admin@example.com";
const roleCode = "TEST_OPTIONS_ADMIN";
const selectionBySku = {
  "TEST-OPTIONS-A": [
    { option: "Size", value: "Medium" },
    { option: "Color", value: "Blue" },
  ],
  "TEST-OPTIONS-B": [
    { option: "Size", value: "Large" },
    { option: "Color", value: "Black" },
  ],
};
let productId: string;

type SavedProduct = {
  options: {
    id: string;
    name: string;
    values: { id: string; value: string }[];
  }[];
  variants: {
    id: string;
    sku: keyof typeof selectionBySku;
    isActive: boolean;
    prices: { currencyCode: string; amountMinor: number }[];
    optionValues: { optionId: string; valueId: string }[];
  }[];
};

async function cleanup() {
  await prisma.product.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.role.deleteMany({ where: { code: roleCode } });
}

async function createAgent(withPermission = true) {
  const agent = request.agent(app);
  const registration = await agent
    .post("/api/auth/register")
    .send({
      email,
      name: "Options Admin",
      password: "OptionsPass123!",
    })
    .expect(201);
  if (withPermission) {
    const permission = await prisma.permission.upsert({
      where: { code: PERMISSION_CODES.CATALOG_WRITE },
      update: {},
      create: { code: PERMISSION_CODES.CATALOG_WRITE, name: "Manage catalog" },
    });
    const role = await prisma.role.create({
      data: {
        code: roleCode,
        name: "Options administrator",
        rolePermissions: { create: { permissionId: permission.id } },
      },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: registration.body.user.id, roleId: role.id },
    });
  }
  const token = await agent.get("/api/auth/csrf-token").expect(200);
  return { agent, csrfToken: token.body.csrfToken as string };
}

function configuration(): ProductOptionsInput {
  return {
    options: [
      {
        name: "Size",
        values: [{ value: "Medium" }, { value: "Large" }],
      },
      {
        name: "Color",
        values: [{ value: "Blue" }, { value: "Black" }],
      },
    ],
    variants: [
      {
        name: "Medium / Blue",
        sku: "TEST-OPTIONS-A",
        prices: [{ currency: "USD", amountMinor: 5000 }],
        stock: 2,
        selections: selectionBySku["TEST-OPTIONS-A"],
      },
      {
        name: "Large / Black",
        sku: "TEST-OPTIONS-B",
        prices: [{ currency: "USD", amountMinor: 5500 }],
        stock: 0,
        selections: selectionBySku["TEST-OPTIONS-B"],
      },
    ],
  };
}

function existingConfiguration(product: SavedProduct): ProductOptionsInput {
  return {
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values.map((value) => ({
        id: value.id,
        value: value.value,
      })),
    })),
    variants: product.variants
      .filter(({ isActive }) => isActive)
      .map((variant) => ({
        id: variant.id,
        selections: selectionBySku[variant.sku],
      })),
  };
}

describe("admin product options", () => {
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
    const product = await prisma.product.create({
      data: {
        name: "Test Options Hoodie",
        slug,
        description: "Options integration fixture.",
      },
      select: { id: true },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires authentication, catalog write permission, and a valid CSRF token", async () => {
    const path = `/api/admin/products/${productId}/options`;
    await request(app).put(path).send(configuration()).expect(401);
    const { agent, csrfToken } = await createAgent(false);
    await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(configuration()).expect(403);
    expect(await prisma.productVariant.count({ where: { productId } })).toBe(0);
  });

  it("rejects missing and incorrect CSRF tokens for an authorized administrator", async () => {
    const { agent } = await createAgent();
    const path = `/api/admin/products/${productId}/options`;
    await agent.put(path).send(configuration()).expect(403);
    await agent.put(path).set(CSRF_HEADER_NAME, "wrong").send(configuration()).expect(403);
  });

  it("creates variants, preserves IDs on an ID-aware retry, and resolves selections in either order", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = `/api/admin/products/${productId}/options`;
    const first = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(configuration()).expect(200);
    const retry = existingConfiguration(first.body.product as SavedProduct);
    const second = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(retry).expect(200);
    expect(second.body).toEqual(first.body);

    const firstVariant = (first.body.product as SavedProduct).variants[0];
    const ids = firstVariant.optionValues.map(({ valueId }) => valueId);
    for (const selection of [ids, [...ids].reverse()]) {
      const result = await request(app)
        .get(`/api/storefront/products/${slug}/variant`)
        .query({ optionValueIds: selection })
        .expect(200);
      expect(result.body).toMatchObject({
        variant: { id: firstVariant.id },
        availability: "in_stock",
      });
    }
  });

  it("rolls back the complete snapshot when a duplicate or invalid selection is rejected", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = `/api/admin/products/${productId}/options`;
    const before = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(configuration()).expect(200);
    const duplicate = existingConfiguration(before.body.product as SavedProduct);
    duplicate.variants[1].selections = [...duplicate.variants[0].selections].reverse();
    await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(duplicate).expect(409);

    const missing = existingConfiguration(before.body.product as SavedProduct);
    missing.variants[0].selections.pop();
    await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(missing).expect(400);

    const after = await agent
      .put(path)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send(existingConfiguration(before.body.product as SavedProduct))
      .expect(200);
    expect(after.body).toEqual(before.body);
  });

  it("swaps combinations atomically without replacing commercial data", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = `/api/admin/products/${productId}/options`;
    const before = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(configuration()).expect(200);
    const swapped = existingConfiguration(before.body.product as SavedProduct);
    [swapped.variants[0].selections, swapped.variants[1].selections] = [
      swapped.variants[1].selections,
      swapped.variants[0].selections,
    ];
    const result = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(swapped).expect(200);
    expect(result.body.product.variants).toMatchObject([
      {
        sku: "TEST-OPTIONS-A",
        prices: [{ currencyCode: "USD", amountMinor: 5000 }],
        stock: 2,
        isActive: true,
      },
      {
        sku: "TEST-OPTIONS-B",
        prices: [{ currencyCode: "USD", amountMinor: 5500 }],
        stock: 0,
        isActive: true,
      },
    ]);
    expect(result.body.product.variants[0].optionValues).toEqual(before.body.product.variants[1].optionValues);
    expect(result.body.product.variants[1].optionValues).toEqual(before.body.product.variants[0].optionValues);
  });

  it("archives omitted variants, hides them from the storefront, and can reactivate the same record", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = `/api/admin/products/${productId}/options`;
    const first = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(configuration()).expect(200);
    const firstProduct = first.body.product as SavedProduct;
    const activeVariant = firstProduct.variants[0];
    const omittedVariant = firstProduct.variants[1];
    const omittedSelectionIds = omittedVariant.optionValues.map(({ valueId }) => valueId);
    const archivedRequest = existingConfiguration(firstProduct);
    archivedRequest.variants = [archivedRequest.variants[0]];

    const archived = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(archivedRequest).expect(200);
    expect(archived.body.product.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: activeVariant.id, isActive: true }),
        expect.objectContaining({ id: omittedVariant.id, isActive: false }),
      ]),
    );
    const storefront = await request(app).get(`/api/storefront/products/${slug}`).expect(200);
    expect(storefront.body.product.variants).toHaveLength(1);
    expect(storefront.body.product.variants[0].id).toBe(activeVariant.id);
    await request(app)
      .get(`/api/storefront/products/${slug}/variant`)
      .query({ optionValueIds: omittedSelectionIds })
      .expect(200, { variant: null, availability: "unavailable" });

    const reactivation = existingConfiguration(firstProduct);
    reactivation.options = existingConfiguration(archived.body.product as SavedProduct).options;
    const reactivated = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(reactivation).expect(200);
    expect(reactivated.body.product.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: omittedVariant.id,
          sku: "TEST-OPTIONS-B",
          prices: [{ currencyCode: "USD", amountMinor: 5500 }],
          stock: 0,
          isActive: true,
        }),
      ]),
    );
  });

  it("renames options and values without replacing their IDs", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = `/api/admin/products/${productId}/options`;
    const first = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(configuration()).expect(200);
    const firstProduct = first.body.product as SavedProduct;
    const size = firstProduct.options.find(({ name }) => name === "Size")!;
    const medium = size.values.find(({ value }) => value === "Medium")!;
    const renamed = existingConfiguration(firstProduct);
    const renamedSize = renamed.options.find(({ name }) => name === "Size")!;
    renamedSize.name = "Fit";
    renamedSize.values.find(({ value }) => value === "Medium")!.value = "Regular";
    for (const variant of renamed.variants) {
      for (const selection of variant.selections) {
        if (selection.option === "Size") selection.option = "Fit";
        if (selection.value === "Medium") selection.value = "Regular";
      }
    }

    const result = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(renamed).expect(200);
    const savedFit = (result.body.product as SavedProduct).options.find(({ name }) => name === "Fit")!;
    expect(savedFit.id).toBe(size.id);
    expect(savedFit.values.find(({ value }) => value === "Regular")!.id).toBe(medium.id);
  });

  it("rejects unknown products and foreign variant, option, or value IDs", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = `/api/admin/products/${productId}/options`;
    await agent
      .put("/api/admin/products/missing-product/options")
      .set(CSRF_HEADER_NAME, csrfToken)
      .send(configuration())
      .expect(404);
    const first = await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(configuration()).expect(200);

    const foreignVariant = existingConfiguration(first.body.product as SavedProduct);
    foreignVariant.variants[0].id = "another-product-variant";
    await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(foreignVariant).expect(400);

    const foreignOption = existingConfiguration(first.body.product as SavedProduct);
    foreignOption.options[0].id = "another-product-option";
    await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(foreignOption).expect(400);

    const foreignValue = existingConfiguration(first.body.product as SavedProduct);
    foreignValue.options[0].values[0].id = "another-option-value";
    await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(foreignValue).expect(400);
  });
});
