import { PERMISSION_CODES, type PermissionCode } from "../src/modules/authorization/authorization.constants.js";
import { hashPassword } from "../src/modules/auth/auth.password.js";
import { configurePricingSettings, storeExchangeRates } from "../src/modules/pricing/pricing.service.js";
import { prisma } from "../src/shared/db/prisma.js";
import { configureProductOptions } from "../src/modules/products/product-options.service.js";
import { configureProductVariantImages } from "../src/modules/products/product-variant-images.service.js";

const demoPassword = "DemoPass123!";

const defaultPermissions = [
  {
    code: PERMISSION_CODES.CATALOG_READ,
    name: "View catalog",
    description: "View products, categories, and catalog details.",
  },
  {
    code: PERMISSION_CODES.CATALOG_WRITE,
    name: "Manage catalog",
    description: "Create, update, and archive products and categories.",
  },
  {
    code: PERMISSION_CODES.INVENTORY_READ,
    name: "View inventory",
    description: "View product inventory levels.",
  },
  {
    code: PERMISSION_CODES.INVENTORY_WRITE,
    name: "Manage inventory",
    description: "Update product inventory levels.",
  },
  {
    code: PERMISSION_CODES.ORDERS_READ,
    name: "View orders",
    description: "View orders and order details.",
  },
  {
    code: PERMISSION_CODES.ORDERS_WRITE,
    name: "Manage orders",
    description: "Update order status and fulfillment details.",
  },
  {
    code: PERMISSION_CODES.STAFF_READ,
    name: "View staff",
    description: "View staff accounts and their assigned roles.",
  },
  {
    code: PERMISSION_CODES.STAFF_WRITE,
    name: "Manage staff",
    description: "Add, remove, and change roles for staff accounts.",
  },
  {
    code: PERMISSION_CODES.SETTINGS_READ,
    name: "View commerce settings",
    description: "View commerce configuration and settings.",
  },
  {
    code: PERMISSION_CODES.SETTINGS_WRITE,
    name: "Manage commerce settings",
    description: "Update commerce configuration and settings.",
  },
] as const;

type DefaultRoleSeed = {
  code: string;
  name: string;
  description: string;
  permissionCodes: readonly PermissionCode[];
};

const allPermissionCodes = defaultPermissions.map(({ code }) => code);

const defaultRoles = [
  {
    code: "OWNER",
    name: "Owner",
    description: "Full control over commerce operations, staff, and settings.",
    permissionCodes: allPermissionCodes,
  },
  {
    code: "ADMIN",
    name: "Admin",
    description: "Manage commerce operations without changing staff or settings.",
    permissionCodes: [
      PERMISSION_CODES.CATALOG_READ,
      PERMISSION_CODES.CATALOG_WRITE,
      PERMISSION_CODES.INVENTORY_READ,
      PERMISSION_CODES.INVENTORY_WRITE,
      PERMISSION_CODES.ORDERS_READ,
      PERMISSION_CODES.ORDERS_WRITE,
      PERMISSION_CODES.STAFF_READ,
      PERMISSION_CODES.SETTINGS_READ,
    ],
  },
  {
    code: "STAFF",
    name: "Staff",
    description: "Handle inventory and orders with read-only catalog access.",
    permissionCodes: [
      PERMISSION_CODES.CATALOG_READ,
      PERMISSION_CODES.INVENTORY_READ,
      PERMISSION_CODES.INVENTORY_WRITE,
      PERMISSION_CODES.ORDERS_READ,
      PERMISSION_CODES.ORDERS_WRITE,
    ],
  },
] as const satisfies readonly DefaultRoleSeed[];

const demoCategories = [
  { name: "Workspace", slug: "workspace" },
  { name: "Apparel", slug: "apparel" },
  { name: "Accessories", slug: "accessories" },
] as const;

const demoProducts = [
  {
    name: "Desk Organizer Set",
    slug: "desk-organizer-set",
    description: "A modular desk organizer with trays for stationery, notes, and daily essentials.",
    options: [],
    variants: [
      {
        name: "Default",
        sku: "DESK-ORG",
        selections: [],
        prices: [
          { currency: "USD", amountMinor: 3499 },
          { currency: "EUR", amountMinor: 3299 },
        ],
        stock: 24,
        imageIds: ["demo-desk-organizer-cover"],
      },
    ],
    images: [
      {
        id: "demo-desk-organizer-cover",
        url: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1200&q=80",
        altText: "Workspace inspiration for the desk organizer set",
        position: 0,
      },
    ],
    categorySlugs: ["workspace"],
  },
  {
    name: "Ergonomic Laptop Stand",
    slug: "ergonomic-laptop-stand",
    description: "Adjustable aluminum laptop stand designed for cleaner posture and better airflow.",
    options: [],
    variants: [
      {
        name: "Default",
        sku: "LAPTOP-STAND",
        selections: [],
        prices: [{ currency: "USD", amountMinor: 5899 }],
        stock: 18,
        imageIds: ["demo-laptop-stand-cover"],
      },
    ],
    images: [
      {
        id: "demo-laptop-stand-cover",
        url: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=1200&q=80",
        altText: "Workspace inspiration for the laptop stand",
        position: 0,
      },
    ],
    categorySlugs: ["workspace"],
  },
  {
    name: "Everyday Cotton Hoodie",
    slug: "everyday-cotton-hoodie",
    description: "Midweight cotton hoodie with a relaxed fit for daily wear.",
    options: [
      { name: "Size", values: ["Medium", "Large", "Extra Large"] },
      { name: "Color", values: ["Blue", "Black"] },
    ],
    variants: [
      {
        name: "Medium / Blue",
        sku: "HOODIE-M",
        selections: [
          { option: "Size", value: "Medium" },
          { option: "Color", value: "Blue" },
        ],
        prices: [
          { currency: "USD", amountMinor: 6499 },
          { currency: "EUR", amountMinor: 5999 },
        ],
        stock: 20,
        imageIds: ["demo-hoodie-cover", "demo-hoodie-detail"],
      },
      {
        name: "Large / Blue",
        sku: "HOODIE-L",
        selections: [
          { option: "Size", value: "Large" },
          { option: "Color", value: "Blue" },
        ],
        prices: [{ currency: "USD", amountMinor: 6799 }],
        stock: 12,
        imageIds: ["demo-hoodie-cover"],
      },
      {
        name: "Extra Large / Black",
        sku: "HOODIE-XL",
        selections: [
          { option: "Size", value: "Extra Large" },
          { option: "Color", value: "Black" },
        ],
        prices: [{ currency: "USD", amountMinor: 6999 }],
        stock: 0,
        imageIds: [],
      },
    ],
    images: [
      {
        id: "demo-hoodie-cover",
        url: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=1200&q=80",
        altText: "Everyday cotton hoodie",
        position: 0,
      },
      {
        id: "demo-hoodie-detail",
        url: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=1200&h=800&crop=top&q=80",
        altText: "Cropped detail of the everyday cotton hoodie",
        position: 1,
      },
    ],
    categorySlugs: ["apparel"],
  },
  {
    name: "Minimal Canvas Tote",
    slug: "minimal-canvas-tote",
    description: "Heavy canvas tote with reinforced handles and an internal pocket.",
    options: [],
    variants: [
      {
        name: "Default",
        sku: "CANVAS-TOTE",
        selections: [],
        prices: [{ currency: "USD", amountMinor: 2799 }],
        stock: 45,
        imageIds: ["demo-canvas-tote-cover"],
      },
    ],
    images: [
      {
        id: "demo-canvas-tote-cover",
        url: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1200&q=80",
        altText: "Bag inspiration for the canvas tote",
        position: 0,
      },
    ],
    categorySlugs: ["accessories", "workspace"],
  },
] as const;

async function seedAuthorization() {
  const permissionIdByCode = new Map<PermissionCode, string>();

  for (const permission of defaultPermissions) {
    const savedPermission = await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        name: permission.name,
        description: permission.description,
      },
      create: permission,
      select: { id: true },
    });

    permissionIdByCode.set(permission.code, savedPermission.id);
  }

  for (const role of defaultRoles) {
    const permissionIds = role.permissionCodes.map((permissionCode) => {
      const permissionId = permissionIdByCode.get(permissionCode);

      if (!permissionId) {
        throw new Error(`Missing seeded permission: ${permissionCode}`);
      }

      return permissionId;
    });

    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
        rolePermissions: {
          deleteMany: {},
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        rolePermissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
    });
  }
}

async function seedPricing() {
  await configurePricingSettings({
    baseCurrency: "USD",
    currencies: [
      { code: "USD", minorUnitDigits: 2 },
      { code: "EUR", minorUnitDigits: 2 },
      { code: "LKR", minorUnitDigits: 2 },
    ],
    rateTtlMinutes: 7 * 24 * 60,
  });
  // Use fixed demo exchange rates so every seed run produces the same results. A production system
  // should fetch current rates from an approved exchange-rate provider.
  await storeExchangeRates({
    provider: "seeded-demo",
    rates: [
      { quoteCurrency: "EUR", rate: "0.920000000000" },
      { quoteCurrency: "LKR", rate: "305.500000000000" },
    ],
  });
}

async function seedDemoOwner(userId: string) {
  const ownerRole = await prisma.role.findUnique({
    where: { code: "OWNER" },
    select: { id: true },
  });

  if (!ownerRole) {
    throw new Error("Missing seeded role: OWNER");
  }

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId: {
        userId,
        roleId: ownerRole.id,
      },
    },
    update: {},
    create: {
      userId,
      roleId: ownerRole.id,
    },
  });
}

async function main() {
  const adminPasswordHash = await hashPassword(demoPassword);
  const customerPasswordHash = await hashPassword(demoPassword);

  const savedAdmin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      name: "Demo Admin",
      passwordHash: adminPasswordHash,
    },
    create: {
      email: "admin@example.com",
      name: "Demo Admin",
      passwordHash: adminPasswordHash,
    },
    select: { id: true },
  });

  await prisma.user.upsert({
    where: { email: "customer@example.com" },
    update: {
      name: "Demo Customer",
      passwordHash: customerPasswordHash,
    },
    create: {
      email: "customer@example.com",
      name: "Demo Customer",
      passwordHash: customerPasswordHash,
    },
  });

  await seedAuthorization();
  await seedDemoOwner(savedAdmin.id);
  await seedPricing();

  const categoryIdBySlug = new Map<string, string>();

  for (const category of demoCategories) {
    const savedCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
      select: {
        id: true,
        slug: true,
      },
    });

    categoryIdBySlug.set(savedCategory.slug, savedCategory.id);
  }

  for (const product of demoProducts) {
    const categoryIds = product.categorySlugs.map((categorySlug) => {
      const categoryId = categoryIdBySlug.get(categorySlug);

      if (!categoryId) {
        throw new Error(`Missing demo category: ${categorySlug}`);
      }

      return categoryId;
    });

    const savedProduct = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        images: {
          upsert: product.images.map((image) => ({
            where: { id: image.id },
            update: {
              url: image.url,
              altText: image.altText,
              position: image.position,
            },
            create: { ...image },
          })),
        },
        isActive: true,
        categoryLinks: {
          deleteMany: {},
          create: categoryIds.map((categoryId) => ({ categoryId })),
        },
      },
      create: {
        name: product.name,
        slug: product.slug,
        description: product.description,
        images: {
          create: product.images.map((image) => ({ ...image })),
        },
        categoryLinks: {
          create: categoryIds.map((categoryId) => ({ categoryId })),
        },
      },
      select: { id: true },
    });

    const existingVariants = await prisma.productVariant.findMany({
      where: { productId: savedProduct.id },
      select: { id: true, sku: true },
    });
    const variantIdBySku = new Map(existingVariants.map(({ id, sku }) => [sku, id]));
    const configuredProduct = await configureProductOptions(savedProduct.id, {
      options: product.options.map((option) => ({
        name: option.name,
        values: option.values.map((value) => ({ value })),
      })),
      variants: product.variants.map((variant) => {
        const id = variantIdBySku.get(variant.sku);

        return {
          ...(id ? { id } : {}),
          name: variant.name,
          sku: variant.sku,
          prices: variant.prices,
          stock: variant.stock,
          selections: variant.selections,
        };
      }),
    });

    const desiredVariantBySku = new Map<string, (typeof product.variants)[number]>(
      product.variants.map((variant) => [variant.sku, variant] as const),
    );
    // Variant IDs must exist before their ordered image links can be configured.
    await configureProductVariantImages(savedProduct.id, {
      variants: configuredProduct.variants.map((variant) => ({
        variantId: variant.id,
        imageIds: desiredVariantBySku.get(variant.sku)?.imageIds ?? [],
      })),
    });
  }

  console.log(
    "Seeded demo users, roles, permissions, pricing, categories, products, variants, options, images, and variant image assignments.",
  );
  console.log("Admin: admin@example.com / DemoPass123!");
  console.log("Customer: customer@example.com / DemoPass123!");
}

main()
  .catch((error) => {
    console.error("Seed failed.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
