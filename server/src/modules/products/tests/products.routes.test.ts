import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/db/prisma.js";
import { COMMERCE_SETTINGS_ID } from "../../pricing/pricing.constants.js";
import { configureProductOptions } from "../product-options.service.js";
import { configureProductVariantImages } from "../product-variant-images.service.js";

const categorySlugs = ["test-accessories", "test-apparel"];
const productSlugs = ["test-canvas-tote", "test-cotton-hoodie", "test-hidden-wallet", "test-unconfigured-product"];
const storefrontProductsPath = "/api/storefront/products";
const toteImages = [
  {
    id: "test-tote-image-side",
    url: "https://example.com/tote-side.jpg",
    altText: "Canvas tote from the side",
    position: 2,
  },
  {
    id: "test-tote-image-front",
    url: "https://example.com/tote-front.jpg",
    altText: "Canvas tote from the front",
    position: 0,
  },
  {
    id: "test-tote-image-back",
    url: "https://example.com/tote-back.jpg",
    altText: null,
    position: 2,
  },
];
const toteVariants = [
  {
    name: "Natural",
    sku: "TEST-TOTE-NATURAL",
    stock: 12,
    price: {
      amountMinor: 2499,
      currency: "USD",
      minorUnitDigits: 2,
      source: "explicit",
      baseAmountMinor: 2499,
      baseCurrency: "USD",
      exchangeRate: null,
      rateProvider: null,
      rateFetchedAt: null,
      rateExpiresAt: null,
    },
  },
  {
    name: "Blue",
    sku: "TEST-TOTE-BLUE",
    stock: 0,
    price: {
      amountMinor: 2699,
      currency: "USD",
      minorUnitDigits: 2,
      source: "explicit",
      baseAmountMinor: 2699,
      baseCurrency: "USD",
      exchangeRate: null,
      rateProvider: null,
      rateFetchedAt: null,
      rateExpiresAt: null,
    },
  },
];

async function ensurePricingFixtures() {
  for (const code of ["USD", "EUR"]) {
    await prisma.commerceCurrency.upsert({
      where: { code },
      update: { minorUnitDigits: 2, isEnabled: true },
      create: { code, minorUnitDigits: 2, isEnabled: true },
    });
  }
  await prisma.commerceSettings.upsert({
    where: { id: COMMERCE_SETTINGS_ID },
    update: { baseCurrencyCode: "USD", rateTtlMinutes: 1440 },
    create: { id: COMMERCE_SETTINGS_ID, baseCurrencyCode: "USD", rateTtlMinutes: 1440 },
  });
  const fetchedAt = new Date();
  await prisma.exchangeRate.upsert({
    where: {
      baseCurrencyCode_quoteCurrencyCode: {
        baseCurrencyCode: "USD",
        quoteCurrencyCode: "EUR",
      },
    },
    update: {
      rate: "0.920000000000",
      provider: "test-provider",
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + 86_400_000),
    },
    create: {
      baseCurrencyCode: "USD",
      quoteCurrencyCode: "EUR",
      rate: "0.920000000000",
      provider: "test-provider",
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + 86_400_000),
    },
  });
}

async function createProductFixtures() {
  const accessories = await prisma.category.create({
    data: {
      name: "Test Accessories",
      slug: "test-accessories",
    },
  });
  const apparel = await prisma.category.create({
    data: {
      name: "Test Apparel",
      slug: "test-apparel",
    },
  });

  const tote = await prisma.product.create({
    data: {
      name: "Test Canvas Tote",
      slug: "test-canvas-tote",
      description: "Durable everyday tote.",
      variants: {
        create: [
          {
            name: "Natural",
            sku: "TEST-TOTE-NATURAL",
            stock: 12,
            prices: { create: { currencyCode: "USD", amountMinor: 2499 } },
          },
          {
            name: "Blue",
            sku: "TEST-TOTE-BLUE",
            stock: 0,
            prices: {
              create: [
                { currencyCode: "USD", amountMinor: 2699 },
                { currencyCode: "EUR", amountMinor: 2499 },
              ],
            },
          },
        ],
      },
      images: { create: toteImages },
      categoryLinks: {
        create: [{ categoryId: accessories.id }, { categoryId: apparel.id }],
      },
    },
    include: { variants: true },
  });

  await configureProductOptions(tote.id, {
    options: [
      {
        name: "Color",
        values: [{ value: "Natural" }, { value: "Blue" }],
      },
    ],
    variants: tote.variants.map((variant) => ({
      id: variant.id,
      selections: [{ option: "Color", value: variant.name }],
    })),
  });

  const hoodie = await prisma.product.create({
    data: {
      name: "Test Cotton Hoodie",
      slug: "test-cotton-hoodie",
      description: "Warm midweight hoodie.",
      images: { create: { url: "https://example.com/hoodie.jpg" } },
      variants: {
        create: {
          sku: "TEST-HOODIE",
          stock: 8,
          prices: { create: { currencyCode: "USD", amountMinor: 6499 } },
        },
      },
      categoryLinks: {
        create: [{ categoryId: apparel.id }],
      },
    },
    include: { variants: true },
  });
  await configureProductOptions(hoodie.id, {
    options: [],
    variants: hoodie.variants.map(({ id }) => ({
      id,
      selections: [],
    })),
  });

  await prisma.product.create({
    data: {
      name: "Test Hidden Wallet",
      slug: "test-hidden-wallet",
      description: "Inactive product should not be listed.",
      variants: {
        create: {
          sku: "TEST-WALLET",
          stock: 4,
          prices: { create: { currencyCode: "USD", amountMinor: 1999 } },
        },
      },
      isActive: false,
      categoryLinks: {
        create: [{ categoryId: accessories.id }],
      },
    },
  });
}

describe("product routes", () => {
  beforeEach(async () => {
    await prisma.product.deleteMany({
      where: { slug: { in: productSlugs } },
    });
    await prisma.category.deleteMany({
      where: { slug: { in: categorySlugs } },
    });
    await ensurePricingFixtures();
  });

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { in: productSlugs } },
    });
    await prisma.category.deleteMany({
      where: { slug: { in: categorySlugs } },
    });
  });

  it("returns active products with categories, variants, and ordered images", async () => {
    await createProductFixtures();

    const response = await request(app).get(storefrontProductsPath).query({ category: "test-accessories" }).expect(200);

    expect(response.body.products).toHaveLength(1);
    expect(response.body.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Test Canvas Tote",
          slug: "test-canvas-tote",
          variants: expect.arrayContaining(toteVariants.map((variant) => expect.objectContaining(variant))),
          categories: expect.arrayContaining([
            expect.objectContaining({
              name: "Test Accessories",
              slug: "test-accessories",
            }),
            expect.objectContaining({
              name: "Test Apparel",
              slug: "test-apparel",
            }),
          ]),
        }),
      ]),
    );
    expect(response.body.products[0]).not.toHaveProperty("priceCents");
    expect(response.body.products[0]).not.toHaveProperty("stock");
    expect(response.body.products[0]).not.toHaveProperty("imageUrl");
    expect(response.body.products[0].images).toEqual([toteImages[1], toteImages[2], toteImages[0]]);
    expect(response.body.products.some((product: { slug: string }) => product.slug === "test-hidden-wallet")).toBe(
      false,
    );
  });

  it("filters products by category slug and search text", async () => {
    await createProductFixtures();

    const response = await request(app)
      .get(storefrontProductsPath)
      .query({ category: "test-accessories", search: "canvas" })
      .expect(200);

    expect(response.body.products).toHaveLength(1);
    expect(response.body.products[0]).toMatchObject({
      name: "Test Canvas Tote",
      slug: "test-canvas-tote",
      categories: expect.arrayContaining([expect.objectContaining({ slug: "test-accessories" })]),
    });
  });

  it("returns an active product by slug", async () => {
    await createProductFixtures();

    const response = await request(app).get(`${storefrontProductsPath}/test-canvas-tote`).expect(200);

    expect(response.body.product).toMatchObject({
      name: "Test Canvas Tote",
      slug: "test-canvas-tote",
      description: "Durable everyday tote.",
      variants: [
        { ...toteVariants[1], id: expect.any(String) },
        { ...toteVariants[0], id: expect.any(String) },
      ],
      categories: expect.arrayContaining([
        expect.objectContaining({
          name: "Test Accessories",
          slug: "test-accessories",
        }),
        expect.objectContaining({
          name: "Test Apparel",
          slug: "test-apparel",
        }),
      ]),
    });
    expect(response.body.product.id).toEqual(expect.any(String));
    expect(response.body.product).not.toHaveProperty("priceCents");
    expect(response.body.product).not.toHaveProperty("stock");
    expect(response.body.product).not.toHaveProperty("imageUrl");
    expect(response.body.product.images).toEqual([toteImages[1], toteImages[2], toteImages[0]]);
  });

  it("uses the same ordered variants and images in list and detail responses", async () => {
    await createProductFixtures();

    const list = await request(app).get(storefrontProductsPath).query({ category: "test-accessories" }).expect(200);
    const detail = await request(app).get(`${storefrontProductsPath}/test-canvas-tote`).expect(200);

    expect(list.body.products[0].variants).toEqual(detail.body.product.variants);
    expect(list.body.products[0].images).toEqual(detail.body.product.images);
  });

  it("uses an explicit requested-currency price before conversion and converts a base-only price", async () => {
    await createProductFixtures();

    const response = await request(app)
      .get(`${storefrontProductsPath}/test-canvas-tote`)
      .query({ currency: "eur" })
      .expect(200);
    const variantBySku = new Map(
      response.body.product.variants.map((variant: { sku: string; price: unknown }) => [variant.sku, variant]),
    );

    expect(variantBySku.get("TEST-TOTE-BLUE")).toMatchObject({
      price: {
        amountMinor: 2499,
        currency: "EUR",
        source: "explicit",
        exchangeRate: null,
      },
    });
    expect(variantBySku.get("TEST-TOTE-NATURAL")).toMatchObject({
      price: {
        amountMinor: 2299,
        currency: "EUR",
        source: "converted",
        baseAmountMinor: 2499,
        baseCurrency: "USD",
        exchangeRate: "0.92",
        rateProvider: "test-provider",
      },
    });
  });

  it("rejects a storefront currency that is not enabled", async () => {
    await createProductFixtures();

    const response = await request(app)
      .get(`${storefrontProductsPath}/test-canvas-tote`)
      .query({ currency: "GBP" })
      .expect(400);
    expect(response.body.error.message).toBe("Currency GBP is not enabled.");
  });

  it("defaults an image to position zero with no alt text", async () => {
    await createProductFixtures();

    const response = await request(app).get(`${storefrontProductsPath}/test-cotton-hoodie`).expect(200);

    expect(response.body.product.images).toEqual([
      {
        id: expect.any(String),
        url: "https://example.com/hoodie.jpg",
        altText: null,
        position: 0,
      },
    ]);
  });

  it("defaults a simple variant to USD and the Default name", async () => {
    await createProductFixtures();

    const response = await request(app).get(`${storefrontProductsPath}/test-cotton-hoodie`).expect(200);

    expect(response.body.product.variants).toEqual([
      {
        id: expect.any(String),
        name: "Default",
        sku: "TEST-HOODIE",
        stock: 8,
        price: {
          amountMinor: 6499,
          currency: "USD",
          minorUnitDigits: 2,
          source: "explicit",
          baseAmountMinor: 6499,
          baseCurrency: "USD",
          exchangeRate: null,
          rateProvider: null,
          rateFetchedAt: null,
          rateExpiresAt: null,
        },
        optionValues: [],
        images: [
          {
            id: expect.any(String),
            url: "https://example.com/hoodie.jpg",
            altText: null,
            position: 0,
          },
        ],
      },
    ]);
  });

  it("returns assigned variant images in link order and falls back to product images", async () => {
    await createProductFixtures();
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: "test-canvas-tote" },
      include: { variants: true },
    });
    const variantIdBySku = new Map(product.variants.map(({ id, sku }) => [sku, id]));
    await configureProductVariantImages(product.id, {
      variants: [
        {
          variantId: variantIdBySku.get("TEST-TOTE-BLUE"),
          imageIds: [toteImages[0].id, toteImages[1].id],
        },
      ],
    });

    const detail = await request(app).get(`${storefrontProductsPath}/test-canvas-tote`).expect(200);
    const blue = detail.body.product.variants.find(({ sku }: { sku: string }) => sku === "TEST-TOTE-BLUE");
    const natural = detail.body.product.variants.find(({ sku }: { sku: string }) => sku === "TEST-TOTE-NATURAL");
    expect(blue.images).toEqual([
      { ...toteImages[0], position: 0 },
      { ...toteImages[1], position: 1 },
    ]);
    expect(natural.images).toEqual([toteImages[1], toteImages[2], toteImages[0]]);

    const blueValueId = detail.body.product.options[0].values.find(
      ({ value }: { value: string }) => value === "Blue",
    ).id;
    const resolved = await request(app)
      .get(`${storefrontProductsPath}/test-canvas-tote/variant`)
      .query({ optionValueIds: blueValueId })
      .expect(200);
    expect(resolved.body.variant.images).toEqual(blue.images);
  });

  it("returns empty variant and image arrays for an unconfigured product", async () => {
    await prisma.product.create({
      data: {
        name: "Test Unconfigured Product",
        slug: "test-unconfigured-product",
        description: "No purchasable variants yet.",
      },
    });

    const response = await request(app).get(`${storefrontProductsPath}/test-unconfigured-product`).expect(200);

    expect(response.body.product.variants).toEqual([]);
    expect(response.body.product.images).toEqual([]);
    expect(response.body.product.options).toEqual([]);

    const list = await request(app)
      .get(storefrontProductsPath)
      .query({ search: "Test Unconfigured Product" })
      .expect(200);

    expect(list.body.products).toHaveLength(1);
    expect(list.body.products[0].images).toEqual([]);
  });

  it("rejects a SKU already assigned to another product", async () => {
    await createProductFixtures();
    const hoodie = await prisma.product.findUniqueOrThrow({
      where: { slug: "test-cotton-hoodie" },
    });

    await expect(
      prisma.productVariant.create({
        data: {
          productId: hoodie.id,
          sku: "TEST-TOTE-NATURAL",
          prices: { create: { currencyCode: "USD", amountMinor: 6499 } },
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("removes variants and image records when their product is deleted", async () => {
    await createProductFixtures();
    const fixture = await prisma.product.findUniqueOrThrow({
      where: { slug: "test-canvas-tote" },
      include: { variants: true },
    });
    await configureProductVariantImages(fixture.id, {
      variants: [
        {
          variantId: fixture.variants[0].id,
          imageIds: [toteImages[0].id],
        },
      ],
    });
    const product = await prisma.product.delete({
      where: { slug: "test-canvas-tote" },
    });

    expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(0);
    expect(await prisma.productVariantPrice.count({ where: { variant: { productId: product.id } } })).toBe(0);
    expect(await prisma.productImage.count({ where: { productId: product.id } })).toBe(0);
    expect(
      await prisma.productVariantImage.count({
        where: { variantId: fixture.variants[0].id },
      }),
    ).toBe(0);
  });

  it("exposes option definitions and resolves an in-stock or sold-out variant by value ID", async () => {
    await createProductFixtures();
    const detail = await request(app).get(`${storefrontProductsPath}/test-canvas-tote`).expect(200);
    const list = await request(app).get(storefrontProductsPath).query({ category: "test-accessories" }).expect(200);
    expect(list.body.products[0].options).toEqual(detail.body.product.options);
    expect(detail.body.product.options).toEqual([
      {
        id: expect.any(String),
        name: "Color",
        position: 0,
        values: [
          { id: expect.any(String), value: "Natural", position: 0 },
          { id: expect.any(String), value: "Blue", position: 1 },
        ],
      },
    ]);
    const color = detail.body.product.options[0];
    for (const [index, sku, availability] of [
      [0, "TEST-TOTE-NATURAL", "in_stock"],
      [1, "TEST-TOTE-BLUE", "out_of_stock"],
    ] as const) {
      const result = await request(app)
        .get(`${storefrontProductsPath}/test-canvas-tote/variant`)
        .query({ optionValueIds: color.values[index].id })
        .expect(200);
      expect(result.body.availability).toBe(availability);
      expect(result.body.variant).toMatchObject({
        sku,
        optionValues: [{ optionId: color.id, valueId: color.values[index].id }],
      });
      expect(result.body.variant).not.toHaveProperty("optionKey");
    }
  });

  it("resolves the configured default variant when a product has no options", async () => {
    await createProductFixtures();
    const result = await request(app).get(`${storefrontProductsPath}/test-cotton-hoodie/variant`).expect(200);
    expect(result.body).toMatchObject({
      variant: { sku: "TEST-HOODIE", optionValues: [] },
      availability: "in_stock",
    });
  });

  it("rejects incomplete selections and values belonging to another product", async () => {
    await createProductFixtures();
    const detail = await request(app).get(`${storefrontProductsPath}/test-canvas-tote`).expect(200);
    await request(app).get(`${storefrontProductsPath}/test-canvas-tote/variant`).expect(400);
    await request(app)
      .get(`${storefrontProductsPath}/test-cotton-hoodie/variant`)
      .query({ optionValueIds: detail.body.product.options[0].values[0].id })
      .expect(400);
    await request(app).get(`${storefrontProductsPath}/test-hidden-wallet/variant`).expect(404);
    await request(app).get(`${storefrontProductsPath}/missing-product/variant`).expect(404);
  });

  it("returns unavailable when an allowed combination has no variant", async () => {
    await createProductFixtures();
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: "test-canvas-tote" },
      include: { variants: true },
    });
    const configured = await configureProductOptions(product.id, {
      options: [
        {
          name: "Color",
          values: [{ value: "Natural" }, { value: "Blue" }, { value: "Black" }],
        },
      ],
      variants: product.variants.map((variant) => ({
        id: variant.id,
        selections: [{ option: "Color", value: variant.name }],
      })),
    });
    const blackId = configured.options[0].values.find(({ value }) => value === "Black")!.id;
    const result = await request(app)
      .get(`${storefrontProductsPath}/test-canvas-tote/variant`)
      .query({ optionValueIds: blackId })
      .expect(200);
    expect(result.body).toEqual({ variant: null, availability: "unavailable" });
  });

  it("returns 404 for a missing product slug", async () => {
    const response = await request(app).get(`${storefrontProductsPath}/missing-product`).expect(404);

    expect(response.body.error.message).toBe("Product not found.");
  });

  it("returns 404 for an inactive product slug", async () => {
    await createProductFixtures();

    const response = await request(app).get(`${storefrontProductsPath}/test-hidden-wallet`).expect(404);

    expect(response.body.error.message).toBe("Product not found.");
  });
});
