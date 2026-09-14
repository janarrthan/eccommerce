import { describe, expect, it } from "vitest";

import {
  convertMinorAmount,
  resolveVariantPrice,
  validateVariantPriceConfiguration,
  type PricingContext,
} from "../pricing.logic.js";
import { exchangeRatesInputSchema, pricingSettingsInputSchema } from "../pricing.validation.js";

const now = new Date("2026-09-11T12:00:00.000Z");

function pricingContext(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    baseCurrency: { code: "USD", minorUnitDigits: 2 },
    requestedCurrency: { code: "EUR", minorUnitDigits: 2 },
    exchangeRate: {
      rate: "0.92",
      provider: "test-provider",
      fetchedAt: new Date("2026-09-11T11:00:00.000Z"),
      expiresAt: new Date("2026-09-12T11:00:00.000Z"),
    },
    now,
    ...overrides,
  };
}

describe("minor-unit currency conversion", () => {
  it("converts with integer arithmetic and half-up rounding", () => {
    expect(convertMinorAmount(6799, 2, 2, "305.5")).toBe(2_077_095);
    expect(convertMinorAmount(6799, 2, 0, "150")).toBe(10_199);
  });

  it("rejects a converted amount outside the database integer range", () => {
    expect(() => convertMinorAmount(2_147_483_647, 0, 3, "999999")).toThrow("supported amount range");
  });
});

describe("variant price resolution", () => {
  const prices = [
    { currencyCode: "USD", amountMinor: 6799 },
    { currencyCode: "EUR", amountMinor: 6299 },
  ];

  it("prefers an explicit requested-currency price", () => {
    expect(resolveVariantPrice(prices, pricingContext())).toEqual({
      amountMinor: 6299,
      currency: "EUR",
      minorUnitDigits: 2,
      source: "explicit",
      baseAmountMinor: 6799,
      baseCurrency: "USD",
      exchangeRate: null,
      rateProvider: null,
      rateFetchedAt: null,
      rateExpiresAt: null,
    });
  });

  it("converts the base price when no explicit requested-currency price exists", () => {
    expect(resolveVariantPrice(prices.slice(0, 1), pricingContext())).toMatchObject({
      amountMinor: 6255,
      currency: "EUR",
      source: "converted",
      baseAmountMinor: 6799,
      baseCurrency: "USD",
      exchangeRate: "0.92",
      rateProvider: "test-provider",
    });
  });

  it("rejects missing base prices and missing or stale conversion rates", () => {
    expect(() => resolveVariantPrice(prices.slice(1), pricingContext())).toThrow("no configured base price");
    expect(() => resolveVariantPrice(prices.slice(0, 1), pricingContext({ exchangeRate: null }))).toThrow(
      "exchange rate is available",
    );
    expect(() =>
      resolveVariantPrice(
        prices.slice(0, 1),
        pricingContext({
          exchangeRate: {
            ...pricingContext().exchangeRate!,
            expiresAt: now,
          },
        }),
      ),
    ).toThrow("exchange rate is stale");
  });
});

describe("pricing configuration validation", () => {
  it("requires unique enabled currencies and includes the base currency", () => {
    expect(
      pricingSettingsInputSchema.parse({
        baseCurrency: " usd ",
        currencies: [
          { code: "usd", minorUnitDigits: 2 },
          { code: "eur", minorUnitDigits: 2 },
        ],
        rateTtlMinutes: 1440,
      }),
    ).toMatchObject({ baseCurrency: "USD", currencies: [{ code: "USD" }, { code: "EUR" }] });
    expect(
      pricingSettingsInputSchema.safeParse({
        baseCurrency: "USD",
        currencies: [{ code: "EUR", minorUnitDigits: 2 }],
        rateTtlMinutes: 1440,
      }).success,
    ).toBe(false);
  });

  it("accepts precise rate strings and rejects duplicate or numeric rates", () => {
    expect(
      exchangeRatesInputSchema.parse({
        provider: "provider",
        rates: [{ quoteCurrency: "eur", rate: "0.920000000001" }],
      }).rates[0],
    ).toEqual({ quoteCurrency: "EUR", rate: "0.920000000001" });
    expect(
      exchangeRatesInputSchema.safeParse({
        provider: "provider",
        rates: [{ quoteCurrency: "EUR", rate: 0.92 }],
      }).success,
    ).toBe(false);
  });

  it("requires each active variant to retain an enabled base price", () => {
    const enabled = new Set(["USD", "EUR"]);
    expect(() =>
      validateVariantPriceConfiguration(
        [{ id: "existing" }],
        [{ id: "existing", prices: [{ currencyCode: "USD" }] }],
        "USD",
        enabled,
      ),
    ).not.toThrow();
    expect(() =>
      validateVariantPriceConfiguration([{ prices: [{ currency: "EUR", amountMinor: 1000 }] }], [], "USD", enabled),
    ).toThrow("requires a USD base price");
    expect(() =>
      validateVariantPriceConfiguration(
        [
          {
            prices: [
              { currency: "USD", amountMinor: 1000 },
              { currency: "GBP", amountMinor: 800 },
            ],
          },
        ],
        [],
        "USD",
        enabled,
      ),
    ).toThrow("GBP is not enabled");
  });
});
