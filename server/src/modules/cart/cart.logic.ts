import { HttpError } from "../../shared/errors/http-error.js";
import { CART_ITEM_AVAILABILITIES, type CartItemAvailability } from "./cart.constants.js";

type CartItemAvailabilityInput = {
  productIsActive: boolean;
  variantIsActive: boolean;
  stock: number;
  quantity: number;
};

type CartTotalInput = {
  quantity: number;
  unitAmountMinor: number;
};

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export function getCartItemAvailability(input: CartItemAvailabilityInput): CartItemAvailability {
  if (!input.productIsActive) {
    return CART_ITEM_AVAILABILITIES.PRODUCT_INACTIVE;
  }
  if (!input.variantIsActive) {
    return CART_ITEM_AVAILABILITIES.VARIANT_INACTIVE;
  }
  if (input.stock <= 0) {
    return CART_ITEM_AVAILABILITIES.OUT_OF_STOCK;
  }
  if (input.quantity > input.stock) {
    return CART_ITEM_AVAILABILITIES.INSUFFICIENT_STOCK;
  }

  return CART_ITEM_AVAILABILITIES.AVAILABLE;
}

export function calculateCartLineTotal(quantity: number, unitAmountMinor: number) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    !Number.isSafeInteger(unitAmountMinor) ||
    unitAmountMinor < 0
  ) {
    throw new HttpError(500, "Cart totals require non-negative integer quantities and prices.");
  }

  const lineTotal = BigInt(quantity) * BigInt(unitAmountMinor);
  if (lineTotal > MAX_SAFE_INTEGER_BIGINT) {
    throw new HttpError(422, "The cart line total exceeds the supported amount range.");
  }

  return Number(lineTotal);
}

export function calculateCartTotals(items: readonly CartTotalInput[]) {
  let totalQuantity = 0n;
  let subtotalAmountMinor = 0n;

  for (const item of items) {
    const lineTotal = calculateCartLineTotal(item.quantity, item.unitAmountMinor);
    totalQuantity += BigInt(item.quantity);
    subtotalAmountMinor += BigInt(lineTotal);
  }

  if (totalQuantity > MAX_SAFE_INTEGER_BIGINT || subtotalAmountMinor > MAX_SAFE_INTEGER_BIGINT) {
    throw new HttpError(422, "The cart total exceeds the supported amount range.");
  }

  return {
    itemCount: items.length,
    totalQuantity: Number(totalQuantity),
    subtotalAmountMinor: Number(subtotalAmountMinor),
  };
}
