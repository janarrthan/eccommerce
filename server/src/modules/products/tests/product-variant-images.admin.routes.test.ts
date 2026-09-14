import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../../app.js";
import { prisma } from "../../../shared/db/prisma.js";
import { CSRF_HEADER_NAME } from "../../../shared/middleware/csrf.js";
import { PERMISSION_CODES } from "../../authorization/authorization.constants.js";

const productSlug = "test-variant-images-product";
const foreignProductSlug = "test-variant-images-foreign-product";
const email = "variant.images.admin@example.com";
const roleCode = "TEST_VARIANT_IMAGES_ADMIN";
const imageIds = ["test-variant-image-front", "test-variant-image-back", "test-variant-image-detail"] as const;
let productId: string;
let variantIds: string[];
let foreignVariantId: string;
let foreignImageId: string;

async function cleanup() {
  await prisma.product.deleteMany({
    where: { slug: { in: [productSlug, foreignProductSlug] } },
  });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.role.deleteMany({ where: { code: roleCode } });
}

async function createAgent(withPermissions = true) {
  const agent = request.agent(app);
  const registration = await agent
    .post("/api/auth/register")
    .send({
      email,
      name: "Variant Image Admin",
      password: "VariantImagesPass123!",
    })
    .expect(201);

  if (withPermissions) {
    const permissions = await Promise.all(
      [PERMISSION_CODES.CATALOG_READ, PERMISSION_CODES.CATALOG_WRITE].map((code) =>
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
        name: "Variant image administrator",
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

describe("admin product variant images", () => {
  beforeEach(async () => {
    await cleanup();
    await prisma.commerceCurrency.upsert({
      where: { code: "USD" },
      update: { minorUnitDigits: 2, isEnabled: true },
      create: { code: "USD", minorUnitDigits: 2, isEnabled: true },
    });
    const product = await prisma.product.create({
      data: {
        name: "Variant Image Product",
        slug: productSlug,
        description: "Variant image integration fixture.",
        images: {
          create: [
            {
              id: imageIds[0],
              url: "https://example.com/front.jpg",
              position: 0,
            },
            {
              id: imageIds[1],
              url: "https://example.com/back.jpg",
              position: 1,
            },
            {
              id: imageIds[2],
              url: "https://example.com/detail.jpg",
              position: 2,
            },
          ],
        },
        variants: {
          create: [
            {
              sku: "TEST-IMAGE-A",
              prices: { create: { currencyCode: "USD", amountMinor: 5000 } },
            },
            {
              sku: "TEST-IMAGE-B",
              prices: { create: { currencyCode: "USD", amountMinor: 5500 } },
            },
          ],
        },
      },
      include: { variants: { orderBy: { sku: "asc" } } },
    });
    productId = product.id;
    variantIds = product.variants.map(({ id }) => id);

    const foreignProduct = await prisma.product.create({
      data: {
        name: "Foreign Variant Image Product",
        slug: foreignProductSlug,
        description: "Foreign ownership fixture.",
        images: {
          create: {
            url: "https://example.com/foreign.jpg",
          },
        },
        variants: {
          create: {
            sku: "TEST-IMAGE-FOREIGN",
            prices: { create: { currencyCode: "USD", amountMinor: 6000 } },
          },
        },
      },
      include: { images: true, variants: true },
    });
    foreignVariantId = foreignProduct.variants[0].id;
    foreignImageId = foreignProduct.images[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("requires permissions and CSRF protection", async () => {
    const path = `/api/admin/products/${productId}/variant-images`;
    await request(app).get(path).expect(401);
    await request(app).put(path).send({ variants: [] }).expect(401);

    const { agent, csrfToken } = await createAgent(false);
    await agent.get(path).expect(403);
    await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send({ variants: [] }).expect(403);
  });

  it("rejects a missing or incorrect CSRF token", async () => {
    const { agent } = await createAgent();
    const path = `/api/admin/products/${productId}/variant-images`;
    await agent.put(path).send({ variants: [] }).expect(403);
    await agent.put(path).set(CSRF_HEADER_NAME, "wrong").send({ variants: [] }).expect(403);
  });

  it("assigns ordered shared images and removes links without deleting images", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = `/api/admin/products/${productId}/variant-images`;
    const assigned = await agent
      .put(path)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({
        variants: [
          { variantId: variantIds[0], imageIds: [imageIds[1], imageIds[0]] },
          { variantId: variantIds[1], imageIds: [imageIds[1]] },
        ],
      })
      .expect(200);
    expect(assigned.body.product.variants).toMatchObject([
      {
        id: variantIds[0],
        imageLinks: [
          { imageId: imageIds[1], position: 0 },
          { imageId: imageIds[0], position: 1 },
        ],
      },
      {
        id: variantIds[1],
        imageLinks: [{ imageId: imageIds[1], position: 0 }],
      },
    ]);

    const read = await agent.get(path).expect(200);
    expect(read.body).toEqual(assigned.body);

    const removed = await agent
      .put(path)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ variants: [{ variantId: variantIds[0], imageIds: [] }] })
      .expect(200);
    expect(removed.body.product.variants[0].imageLinks).toEqual([]);
    expect(removed.body.product.variants[1].imageLinks).toEqual([{ imageId: imageIds[1], position: 0 }]);
    expect(await prisma.productImage.count({ where: { productId } })).toBe(3);
  });

  it("rejects cross-product and duplicate assignments without changing saved links", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = `/api/admin/products/${productId}/variant-images`;
    const baseline = await agent
      .put(path)
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({
        variants: [{ variantId: variantIds[0], imageIds: [imageIds[0]] }],
      })
      .expect(200);

    for (const body of [
      {
        variants: [{ variantId: foreignVariantId, imageIds: [imageIds[0]] }],
      },
      {
        variants: [{ variantId: variantIds[0], imageIds: [foreignImageId] }],
      },
      {
        variants: [
          { variantId: variantIds[0], imageIds: [] },
          { variantId: variantIds[0], imageIds: [] },
        ],
      },
      {
        variants: [{ variantId: variantIds[0], imageIds: [imageIds[0], imageIds[0]] }],
      },
    ]) {
      await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send(body).expect(400);
    }

    const after = await agent.get(path).expect(200);
    expect(after.body).toEqual(baseline.body);
  });

  it("returns 404 for an unknown product", async () => {
    const { agent, csrfToken } = await createAgent();
    const path = "/api/admin/products/missing-product/variant-images";
    await agent.get(path).expect(404);
    await agent.put(path).set(CSRF_HEADER_NAME, csrfToken).send({ variants: [] }).expect(404);
  });
});
