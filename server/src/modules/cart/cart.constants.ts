export const MAX_CART_DISTINCT_ITEMS = 100;

export const CART_ITEM_AVAILABILITIES = {
  AVAILABLE: "available",
  PRODUCT_INACTIVE: "product_inactive",
  VARIANT_INACTIVE: "variant_inactive",
  OUT_OF_STOCK: "out_of_stock",
  INSUFFICIENT_STOCK: "insufficient_stock",
} as const;

export type CartItemAvailability = (typeof CART_ITEM_AVAILABILITIES)[keyof typeof CART_ITEM_AVAILABILITIES];
