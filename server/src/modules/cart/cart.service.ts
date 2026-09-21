import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveVariantPrice } from "../pricing/pricing.logic.js";
import { loadPricingContext } from "../pricing/pricing.service.js";
import { CART_ITEM_AVAILABILITIES, MAX_CART_DISTINCT_ITEMS } from "./cart.constants.js";
import { calculateCartLineTotal, calculateCartTotals, getCartItemAvailability } from "./cart.logic.js";
import { cartItemQuantityInputSchema } from "./cart.validation.js";

const cartImageSelect = {
  id: true,
  url: true,
  altText: true,
} satisfies Prisma.ProductImageSelect;

const cartSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      quantity: true,
      variant: {
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          isActive: true,
          prices: {
            orderBy: { currencyCode: "asc" },
            select: { currencyCode: true, amountMinor: true },
          },
          optionValues: {
            select: {
              value: {
                select: {
                  id: true,
                  value: true,
                  option: { select: { id: true, name: true, position: true } },
                },
              },
            },
          },
          imageLinks: {
            orderBy: [{ position: "asc" }, { imageId: "asc" }],
            select: {
              image: { select: cartImageSelect },
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              images: {
                orderBy: [{ position: "asc" }, { id: "asc" }],
                select: cartImageSelect,
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartSelect;

type CartTransaction = Prisma.TransactionClient;

async function requireCartUser(tx: CartTransaction, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });

  if (!user) {
    throw new HttpError(401, "The authenticated user no longer exists. Sign in again.");
  }
}

function getPrismaErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

async function executeSerializableCartWrite<T>(operation: (tx: CartTransaction) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable", timeout: 15000 });
    } catch (error) {
      const code = getPrismaErrorCode(error);
      const isRetryableConflict = code === "P2002" || code === "P2003" || code === "P2025" || code === "P2034";
      if (isRetryableConflict && attempt < 2) {
        continue;
      }
      if (isRetryableConflict) {
        throw new HttpError(409, "The cart changed concurrently. Reload it and try again.");
      }

      throw error;
    }
  }

  throw new HttpError(409, "Unable to update the cart. Try again.");
}

async function buildCartResponse(tx: CartTransaction, userId: string, requestedCurrency?: string) {
  const pricingContext = await loadPricingContext(tx, requestedCurrency);

  const cart = await tx.cart.findUnique({
    where: { userId },
    select: cartSelect,
  });

  const items =
    cart?.items.map((item) => {
      const unitPrice = resolveVariantPrice(item.variant.prices, pricingContext);
      const availability = getCartItemAvailability({
        productIsActive: item.variant.product.isActive,
        variantIsActive: item.variant.isActive,
        stock: item.variant.stock,
        quantity: item.quantity,
      });
      const linkedImage = item.variant.imageLinks[0];
      const fallbackImage = item.variant.product.images[0];
      const image = linkedImage ? { ...linkedImage.image } : fallbackImage ? { ...fallbackImage } : null;
      const options = item.variant.optionValues
        .map(({ value }) => ({
          optionId: value.option.id,
          optionName: value.option.name,
          optionPosition: value.option.position,
          valueId: value.id,
          value: value.value,
        }))
        .sort(
          (left, right) => left.optionPosition - right.optionPosition || left.optionId.localeCompare(right.optionId),
        );

      return {
        id: item.id,
        quantity: item.quantity,
        availability,
        availableQuantity: item.variant.stock,
        unitPrice,
        lineTotalAmountMinor: calculateCartLineTotal(item.quantity, unitPrice.amountMinor),
        variant: {
          id: item.variant.id,
          name: item.variant.name,
          sku: item.variant.sku,
          options,
          image,
          product: {
            id: item.variant.product.id,
            name: item.variant.product.name,
            slug: item.variant.product.slug,
          },
        },
      };
    }) ?? [];

  const totals = calculateCartTotals(
    items.map((item) => ({ quantity: item.quantity, unitAmountMinor: item.unitPrice.amountMinor })),
  );

  return {
    id: cart?.id ?? null,
    currency: pricingContext.requestedCurrency.code,
    minorUnitDigits: pricingContext.requestedCurrency.minorUnitDigits,
    ...totals,
    isCheckoutReady:
      items.length > 0 && items.every(({ availability }) => availability === CART_ITEM_AVAILABILITIES.AVAILABLE),
    items,
    createdAt: cart?.createdAt ?? null,
    updatedAt: cart?.updatedAt ?? null,
  };
}

export async function getCart(userId: string, requestedCurrency?: string) {
  return prisma.$transaction(
    async (tx) => {
      await requireCartUser(tx, userId);
      return buildCartResponse(tx, userId, requestedCurrency);
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function setCartItemQuantity(
  userId: string,
  variantId: string,
  rawInput: unknown,
  requestedCurrency?: string,
) {
  const input = cartItemQuantityInputSchema.parse(rawInput);

  return executeSerializableCartWrite(async (tx) => {
    await requireCartUser(tx, userId);

    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: {
        stock: true,
        isActive: true,
        product: { select: { isActive: true } },
      },
    });

    if (!variant) {
      throw new HttpError(404, "Variant not found.");
    }

    if (!variant.product.isActive || !variant.isActive) {
      throw new HttpError(409, "This variant is not available for purchase.");
    }

    if (input.quantity > variant.stock) {
      throw new HttpError(409, "The requested quantity exceeds available stock.", {
        availableQuantity: variant.stock,
      });
    }

    let cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
    cart ??= await tx.cart.create({ data: { userId }, select: { id: true } });

    const existingItem = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      select: { id: true, quantity: true },
    });

    if (!existingItem) {
      const itemCount = await tx.cartItem.count({ where: { cartId: cart.id } });

      if (itemCount >= MAX_CART_DISTINCT_ITEMS) {
        throw new HttpError(409, `A cart cannot contain more than ${MAX_CART_DISTINCT_ITEMS} distinct items.`);
      }

      await tx.cartItem.create({
        data: { cartId: cart.id, variantId, quantity: input.quantity },
      });

      await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    } else if (existingItem.quantity !== input.quantity) {
      await tx.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: input.quantity },
      });
      await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    }

    return {
      cart: await buildCartResponse(tx, userId, requestedCurrency),
      created: !existingItem,
    };
  });
}

export async function removeCartItem(userId: string, variantId: string, requestedCurrency?: string) {
  return executeSerializableCartWrite(async (tx) => {
    await requireCartUser(tx, userId);

    const cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });

    if (cart) {
      const deleted = await tx.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
      if (deleted.count > 0) {
        await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
      }
    }

    return buildCartResponse(tx, userId, requestedCurrency);
  });
}
