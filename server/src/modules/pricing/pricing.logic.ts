import { HttpError } from "../../shared/errors/http-error.js";
import { PRICE_SOURCES } from "./pricing.constants.js";
import type { VariantPriceInput } from "./pricing.validation.js";

type CurrencyDefinition = {
  code: string;
  minorUnitDigits: number;
};

type ExchangeRateDefinition = {
  rate: string;
  provider: string;
  fetchedAt: Date;
  expiresAt: Date;
};

export type PricingContext = {
  baseCurrency: CurrencyDefinition;
  requestedCurrency: CurrencyDefinition;
  exchangeRate: ExchangeRateDefinition | null;
  now: Date;
};

type SavedVariantPrice = {
  currencyCode: string;
  amountMinor: number;
};

type VariantPriceConfiguration = {
  id?: string;
  prices?: readonly VariantPriceInput[];
};

type ExistingVariantPrices = {
  id: string;
  prices: readonly { currencyCode: string }[];
};

function getPriceCurrency(price: VariantPriceInput | { currencyCode: string }) {
  return "currency" in price ? price.currency : price.currencyCode;
}

function tenToThe(power: number) {
  return 10n ** BigInt(power);
}

function parsePositiveDecimal(value: string) {
  const [integerPart, fractionPart = ""] = value.split(".");
  return {
    numerator: BigInt(`${integerPart}${fractionPart}`),
    denominator: tenToThe(fractionPart.length),
  };
}

// Currency conversion stays in integer arithmetic to avoid floating-point price drift.
export function convertMinorAmount(
  amountMinor: number,
  baseMinorUnitDigits: number,
  quoteMinorUnitDigits: number,
  rate: string,
) {
  const parsedRate = parsePositiveDecimal(rate);
  const numerator = BigInt(amountMinor) * parsedRate.numerator * tenToThe(quoteMinorUnitDigits);
  const denominator = tenToThe(baseMinorUnitDigits) * parsedRate.denominator;
  // All amounts are nonnegative, so adding half the denominator implements half-up rounding.
  const converted = (numerator + denominator / 2n) / denominator;

  if (converted > 2_147_483_647n) {
    throw new HttpError(422, "The converted price exceeds the supported amount range.");
  }

  return Number(converted);
}

export function validateVariantPriceConfiguration(
  variants: readonly VariantPriceConfiguration[],
  existingVariants: readonly ExistingVariantPrices[],
  baseCurrency: string,
  enabledCurrencies: ReadonlySet<string>,
) {
  const existingById = new Map(existingVariants.map((variant) => [variant.id, variant] as const));

  for (const variant of variants) {
    const effectivePrices = variant.prices ?? (variant.id ? existingById.get(variant.id)?.prices : undefined);

    if (!effectivePrices?.some((price) => getPriceCurrency(price) === baseCurrency)) {
      throw new HttpError(400, `Every active variant requires a ${baseCurrency} base price.`);
    }

    for (const price of effectivePrices) {
      const currency = getPriceCurrency(price);
      if (!enabledCurrencies.has(currency)) {
        throw new HttpError(400, `Currency ${currency} is not enabled for this store.`);
      }
    }
  }
}

export function resolveVariantPrice(prices: readonly SavedVariantPrice[], context: PricingContext) {
  const explicitPrice = prices.find(({ currencyCode }) => currencyCode === context.requestedCurrency.code);
  const basePrice = prices.find(({ currencyCode }) => currencyCode === context.baseCurrency.code);

  if (!basePrice) {
    throw new HttpError(503, "This variant has no configured base price.");
  }

  if (explicitPrice) {
    return {
      amountMinor: explicitPrice.amountMinor,
      currency: context.requestedCurrency.code,
      minorUnitDigits: context.requestedCurrency.minorUnitDigits,
      source: PRICE_SOURCES.EXPLICIT,
      baseAmountMinor: basePrice.amountMinor,
      baseCurrency: context.baseCurrency.code,
      exchangeRate: null,
      rateProvider: null,
      rateFetchedAt: null,
      rateExpiresAt: null,
    };
  }

  if (!context.exchangeRate) {
    throw new HttpError(
      503,
      `No ${context.baseCurrency.code} to ${context.requestedCurrency.code} exchange rate is available.`,
    );
  }

  if (context.exchangeRate.expiresAt.getTime() <= context.now.getTime()) {
    throw new HttpError(503, `The ${context.requestedCurrency.code} exchange rate is stale.`);
  }

  return {
    amountMinor: convertMinorAmount(
      basePrice.amountMinor,
      context.baseCurrency.minorUnitDigits,
      context.requestedCurrency.minorUnitDigits,
      context.exchangeRate.rate,
    ),
    currency: context.requestedCurrency.code,
    minorUnitDigits: context.requestedCurrency.minorUnitDigits,
    source: PRICE_SOURCES.CONVERTED,
    baseAmountMinor: basePrice.amountMinor,
    baseCurrency: context.baseCurrency.code,
    exchangeRate: context.exchangeRate.rate,
    rateProvider: context.exchangeRate.provider,
    rateFetchedAt: context.exchangeRate.fetchedAt.toISOString(),
    rateExpiresAt: context.exchangeRate.expiresAt.toISOString(),
  };
}
