import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/db/prisma.js";
import { CSRF_HEADER_NAME } from "../../../shared/middleware/csrf.js";
import { COMMERCE_SETTINGS_ID } from "../../pricing/pricing.constants.js";
import { configureProductOptions } from "../../products/product-options.service.js";
import { MAX_CART_DISTINCT_ITEMS } from "../cart.constants.js";

const cartPath = "/api/storefront/cart";
const productSlug = "cart-test-backpack";
const productSku = "CART-TEST-BACKPACK";
const customerEmails = ["cart.customer@example.com", "cart.other-customer@example.com"];
const currencyCodes = ["USD", "EUR"];

async function cleanupFixtures() {
  await prisma.user.deleteMany({ where: { email: { in: customerEmails } } });
  await prisma.product.deleteMany({ where: { slug: productSlug } });
  await prisma.exchangeRate.deleteMany({ where: { provider: "cart-test-provider" } });
  await prisma.commerceSettings.deleteMany({ where: { id: COMMERCE_SETTINGS_ID } });
  await prisma.commerceCurrency.deleteMany({ where: { code: { in: currencyCodes } } });
}

async function ensurePricingFixtures() {
  for (const code of currencyCodes) {
    await prisma.commerceCurrency.create({
      data: { code, minorUnitDigits: 2, isEnabled: true },
    });
  }
  await prisma.commerceSettings.create({
    data: { id: COMMERCE_SETTINGS_ID, baseCurrencyCode: "USD", rateTtlMinutes: 1440 },
  });
  const fetchedAt = new Date();
  await prisma.exchangeRate.create({
    data: {
      baseCurrencyCode: "USD",
      quoteCurrencyCode: "EUR",
      rate: "0.920000000000",
      provider: "cart-test-provider",
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + 86_400_000),
    },
  });
}

async function createProductFixture() {
  const product = await prisma.product.create({
    data: {
      name: "Cart Test Backpack",
      slug: productSlug,
      description: "A backpack owned by the cart route tests.",
      images: {
        create: {
          id: "cart-test-backpack-image",
          url: "https://example.com/cart-test-backpack.jpg",
          altText: "Black test backpack",
        },
      },
      variants: {
        create: {
          name: "Black",
          sku: productSku,
          stock: 5,
          prices: { create: { currencyCode: "USD", amountMinor: 2500 } },
        },
      },
    },
    include: { variants: true },
  });

  await configureProductOptions(product.id, {
    options: [{ name: "Color", values: [{ value: "Black" }] }],
    variants: [
      {
        id: product.variants[0].id,
        selections: [{ option: "Color", value: "Black" }],
      },
    ],
  });

  return { productId: product.id, variantId: product.variants[0].id };
}

async function createCustomerAgent(email = customerEmails[0]) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, name: "Cart Customer", password: "CartPass123!" }).expect(201);
  const token = await agent.get("/api/auth/csrf-token").expect(200);

  return { agent, csrfToken: token.body.csrfToken as string };
}

describe("cart routes", () => {
  beforeEach(async () => {
    await cleanupFixtures();
    await ensurePricingFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it("requires authentication for every cart operation", async () => {
    await request(app).get(cartPath).expect(401);
    await request(app).put(`${cartPath}/items/missing-variant`).send({ quantity: 1 }).expect(401);
    await request(app).delete(`${cartPath}/items/missing-variant`).expect(401);
  });

  it("returns a currency-aware empty cart without creating a database row", async () => {
    const { agent } = await createCustomerAgent();
    const response = await agent.get(cartPath).query({ currency: "eur" }).expect(200);

    expect(response.body.cart).toEqual({
      id: null,
      currency: "EUR",
      minorUnitDigits: 2,
      itemCount: 0,
      totalQuantity: 0,
      subtotalAmountMinor: 0,
      isCheckoutReady: false,
      items: [],
      createdAt: null,
      updatedAt: null,
    });
    expect(await prisma.cart.count()).toBe(0);
  });

  it("requires a valid CSRF token for cart mutations", async () => {
    const { variantId } = await createProductFixture();
    const { agent } = await createCustomerAgent();

    await agent.put(`${cartPath}/items/${variantId}`).send({ quantity: 1 }).expect(403);
    await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, "invalid-token")
      .send({ quantity: 1 })
      .expect(403);
    await agent.delete(`${cartPath}/items/${variantId}`).expect(403);
  });

  it("adds a variant and returns server-resolved prices, totals, options, and its fallback image", async () => {
    const { variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();
    const response = await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 2 })
      .expect(201);

    expect(response.body.cart).toMatchObject({
      id: expect.any(String),
      currency: "USD",
      minorUnitDigits: 2,
      itemCount: 1,
      totalQuantity: 2,
      subtotalAmountMinor: 5000,
      isCheckoutReady: true,
      items: [
        {
          id: expect.any(String),
          quantity: 2,
          availability: "available",
          availableQuantity: 5,
          unitPrice: {
            amountMinor: 2500,
            currency: "USD",
            source: "explicit",
            baseAmountMinor: 2500,
            baseCurrency: "USD",
          },
          lineTotalAmountMinor: 5000,
          variant: {
            id: variantId,
            name: "Black",
            sku: productSku,
            options: [
              {
                optionId: expect.any(String),
                optionName: "Color",
                optionPosition: 0,
                valueId: expect.any(String),
                value: "Black",
              },
            ],
            image: {
              id: "cart-test-backpack-image",
              url: "https://example.com/cart-test-backpack.jpg",
              altText: "Black test backpack",
            },
            product: {
              name: "Cart Test Backpack",
              slug: productSlug,
            },
          },
        },
      ],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const read = await agent.get(cartPath).expect(200);
    expect(read.body).toEqual(response.body);
  });

  it("prefers the variant's first linked image over the product fallback image", async () => {
    const { productId, variantId } = await createProductFixture();
    const variantImage = await prisma.productImage.create({
      data: {
        id: "cart-test-backpack-variant-image",
        productId,
        url: "https://example.com/cart-test-backpack-variant.jpg",
        altText: "Black backpack variant detail",
        position: 5,
      },
    });
    await prisma.productVariantImage.create({
      data: { variantId, imageId: variantImage.id, position: 0 },
    });
    const { agent, csrfToken } = await createCustomerAgent();

    const response = await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 1 })
      .expect(201);

    expect(response.body.cart.items[0].variant.image).toEqual({
      id: variantImage.id,
      url: variantImage.url,
      altText: variantImage.altText,
    });
  });

  it("uses idempotent quantity replacement without creating duplicate lines", async () => {
    const { variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();

    await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 1 })
      .expect(201);
    const updated = await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 3 })
      .expect(200);
    const repeated = await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 3 })
      .expect(200);

    expect(updated.body.cart).toMatchObject({
      itemCount: 1,
      totalQuantity: 3,
      subtotalAmountMinor: 7500,
      items: [{ quantity: 3, lineTotalAmountMinor: 7500 }],
    });
    expect(repeated.body.cart).toMatchObject({
      id: updated.body.cart.id,
      itemCount: 1,
      totalQuantity: 3,
      subtotalAmountMinor: 7500,
      items: [{ quantity: 3, lineTotalAmountMinor: 7500 }],
    });
    expect(repeated.body.cart.updatedAt).toBe(updated.body.cart.updatedAt);
    expect(await prisma.cartItem.count()).toBe(1);
  });

  it("re-resolves a currency conversion without persisting a customer currency on the cart", async () => {
    const { variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();
    const euros = await agent
      .put(`${cartPath}/items/${variantId}`)
      .query({ currency: "eur" })
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 2 })
      .expect(201);

    expect(euros.body.cart).toMatchObject({
      currency: "EUR",
      subtotalAmountMinor: 4600,
      items: [
        {
          unitPrice: {
            amountMinor: 2300,
            source: "converted",
            exchangeRate: "0.92",
            rateProvider: "cart-test-provider",
          },
          lineTotalAmountMinor: 4600,
        },
      ],
    });

    const dollars = await agent.get(cartPath).expect(200);
    expect(dollars.body.cart).toMatchObject({
      currency: "USD",
      subtotalAmountMinor: 5000,
      items: [{ unitPrice: { amountMinor: 2500, source: "explicit" } }],
    });
  });

  it("rolls back a mutation when the requested currency cannot be priced", async () => {
    const { variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();
    await prisma.exchangeRate.update({
      where: {
        baseCurrencyCode_quoteCurrencyCode: {
          baseCurrencyCode: "USD",
          quoteCurrencyCode: "EUR",
        },
      },
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    const response = await agent
      .put(`${cartPath}/items/${variantId}`)
      .query({ currency: "EUR" })
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 1 })
      .expect(503);

    expect(response.body.error.message).toBe("The EUR exchange rate is stale.");
    expect(await prisma.cart.count()).toBe(0);
  });

  it("rejects quantities above stock without creating a cart", async () => {
    const { variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();
    const response = await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 6 })
      .expect(409);

    expect(response.body.error).toEqual({
      message: "The requested quantity exceeds available stock.",
      details: { availableQuantity: 5 },
    });
    expect(await prisma.cart.count()).toBe(0);
  });

  it("rejects invalid quantities and unknown request fields", async () => {
    const { variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();

    for (const body of [{ quantity: -1 }, { quantity: 0 }, { quantity: 1.5 }, { quantity: 1, price: 1 }]) {
      await agent.put(`${cartPath}/items/${variantId}`).set(CSRF_HEADER_NAME, csrfToken).send(body).expect(400);
    }

    expect(await prisma.cart.count()).toBe(0);
  });

  it("allows a quantity above 99 when current variant stock supports it", async () => {
    const { variantId } = await createProductFixture();
    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 150 } });
    const { agent, csrfToken } = await createCustomerAgent();

    const response = await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 120 })
      .expect(201);

    expect(response.body.cart).toMatchObject({
      totalQuantity: 120,
      subtotalAmountMinor: 300000,
      items: [{ quantity: 120, availableQuantity: 150, availability: "available" }],
    });
  });

  it("enforces the item quantity range at the database boundary", async () => {
    const { variantId } = await createProductFixture();
    await createCustomerAgent();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: customerEmails[0] },
      select: { id: true },
    });
    const cart = await prisma.cart.create({ data: { userId: user.id } });

    await expect(
      prisma.cartItem.create({
        data: { cartId: cart.id, variantId, quantity: 0 },
      }),
    ).rejects.toThrow();
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });

  it("rejects a new line when the cart already has the maximum number of distinct items", async () => {
    const { productId, variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: customerEmails[0] },
      select: { id: true },
    });
    const cart = await prisma.cart.create({ data: { userId: user.id } });
    await prisma.productVariant.createMany({
      data: Array.from({ length: MAX_CART_DISTINCT_ITEMS }, (_, index) => ({
        productId,
        name: `Filler ${index}`,
        sku: `CART-TEST-FILLER-${index}`,
        stock: 1,
      })),
    });
    const fillerVariants = await prisma.productVariant.findMany({
      where: { productId, sku: { startsWith: "CART-TEST-FILLER-" } },
      select: { id: true },
    });
    await prisma.cartItem.createMany({
      data: fillerVariants.map(({ id }) => ({ cartId: cart.id, variantId: id, quantity: 1 })),
    });

    const response = await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 1 })
      .expect(409);

    expect(response.body.error.message).toBe(
      `A cart cannot contain more than ${MAX_CART_DISTINCT_ITEMS} distinct items.`,
    );
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(MAX_CART_DISTINCT_ITEMS);
  });

  it("reports inventory and lifecycle changes that make an existing line unavailable", async () => {
    const { productId, variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();
    await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 4 })
      .expect(201);

    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 2 } });
    let response = await agent.get(cartPath).expect(200);
    expect(response.body.cart).toMatchObject({
      isCheckoutReady: false,
      items: [{ availability: "insufficient_stock", availableQuantity: 2 }],
    });

    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 0 } });
    response = await agent.get(cartPath).expect(200);
    expect(response.body.cart.items[0].availability).toBe("out_of_stock");

    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    response = await agent.get(cartPath).expect(200);
    expect(response.body.cart.items[0].availability).toBe("variant_inactive");

    await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
    response = await agent.get(cartPath).expect(200);
    expect(response.body.cart.items[0].availability).toBe("product_inactive");
  });

  it("keeps customer carts isolated and makes item removal idempotent", async () => {
    const { variantId } = await createProductFixture();
    const first = await createCustomerAgent(customerEmails[0]);
    const second = await createCustomerAgent(customerEmails[1]);
    await first.agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, first.csrfToken)
      .send({ quantity: 2 })
      .expect(201);

    const secondRemoval = await second.agent
      .delete(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, second.csrfToken)
      .expect(200);
    expect(secondRemoval.body.cart.items).toEqual([]);
    expect((await first.agent.get(cartPath).expect(200)).body.cart.itemCount).toBe(1);

    const removed = await first.agent
      .delete(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, first.csrfToken)
      .expect(200);
    const repeated = await first.agent
      .delete(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, first.csrfToken)
      .expect(200);

    expect(removed.body.cart).toMatchObject({ itemCount: 0, totalQuantity: 0, subtotalAmountMinor: 0, items: [] });
    expect(repeated.body.cart).toMatchObject(removed.body.cart);
  });

  it("rejects missing and inactive variants", async () => {
    const { productId, variantId } = await createProductFixture();
    const { agent, csrfToken } = await createCustomerAgent();

    await agent
      .put(`${cartPath}/items/missing-variant`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 1 })
      .expect(404);

    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 1 })
      .expect(409);

    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: true } });
    await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
    await agent
      .put(`${cartPath}/items/${variantId}`)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ quantity: 1 })
      .expect(409);
  });
});
