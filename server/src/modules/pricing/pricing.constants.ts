export const COMMERCE_SETTINGS_ID = "default";

export const PRICE_SOURCES = {
  EXPLICIT: "explicit",
  CONVERTED: "converted",
} as const;

export type PriceSource = (typeof PRICE_SOURCES)[keyof typeof PRICE_SOURCES];
