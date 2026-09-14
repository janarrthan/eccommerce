import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { COMMERCE_SETTINGS_ID } from "./pricing.constants.js";
import { exchangeRatesInputSchema, pricingSettingsInputSchema } from "./pricing.validation.js";

const currencySelect = {
  code: true,
  minorUnitDigits: true,
} satisfies Prisma.CommerceCurrencySelect;

type PricingReader = Pick<typeof prisma, "commerceSettings" | "commerceCurrency" | "exchangeRate">;

async function requirePricingSettings(client: PricingReader) {
  const settings = await client.commerceSettings.findUnique({
    where: { id: COMMERCE_SETTINGS_ID },
    select: {
      baseCurrencyCode: true,
      rateTtlMinutes: true,
      baseCurrency: { select: { ...currencySelect, isEnabled: true } },
    },
  });

  if (!settings) {
    throw new HttpError(503, "Commerce pricing has not been configured.");
  }
  if (!settings.baseCurrency.isEnabled) {
    throw new HttpError(503, "The configured base currency is disabled.");
  }

  return settings;
}

export async function loadPricingContext(client: PricingReader, requestedCurrency?: string, now = new Date()) {
  const settings = await requirePricingSettings(client);
  const selectedCode = requestedCurrency ?? settings.baseCurrencyCode;
  const selectedCurrency = await client.commerceCurrency.findFirst({
    where: { code: selectedCode, isEnabled: true },
    select: currencySelect,
  });

  if (!selectedCurrency) {
    throw new HttpError(400, `Currency ${selectedCode} is not enabled.`);
  }

  // This may remain null: an explicit requested-currency variant price does not need conversion.
  const exchangeRate =
    selectedCode === settings.baseCurrencyCode
      ? null
      : await client.exchangeRate.findUnique({
          where: {
            baseCurrencyCode_quoteCurrencyCode: {
              baseCurrencyCode: settings.baseCurrencyCode,
              quoteCurrencyCode: selectedCode,
            },
          },
          select: {
            rate: true,
            provider: true,
            fetchedAt: true,
            expiresAt: true,
          },
        });

  return {
    baseCurrency: settings.baseCurrency,
    requestedCurrency: selectedCurrency,
    exchangeRate: exchangeRate ? { ...exchangeRate, rate: exchangeRate.rate.toString() } : null,
    now,
  };
}

export async function getStorefrontPricingConfiguration() {
  const settings = await requirePricingSettings(prisma);
  const currencies = await prisma.commerceCurrency.findMany({
    where: { isEnabled: true },
    orderBy: { code: "asc" },
    select: currencySelect,
  });

  return {
    baseCurrency: settings.baseCurrencyCode,
    currencies,
  };
}

export async function getAdminPricingConfiguration() {
  const settings = await requirePricingSettings(prisma);

  const [currencies, exchangeRates] = await Promise.all([
    prisma.commerceCurrency.findMany({
      orderBy: { code: "asc" },
      select: { ...currencySelect, isEnabled: true },
    }),

    prisma.exchangeRate.findMany({
      where: { baseCurrencyCode: settings.baseCurrencyCode },
      orderBy: { quoteCurrencyCode: "asc" },
      select: {
        baseCurrencyCode: true,
        quoteCurrencyCode: true,
        rate: true,
        provider: true,
        fetchedAt: true,
        expiresAt: true,
      },
    }),
  ]);

  return {
    baseCurrency: settings.baseCurrencyCode,
    rateTtlMinutes: settings.rateTtlMinutes,
    currencies,
    exchangeRates: exchangeRates.map((rate) => ({ ...rate, rate: rate.rate.toString() })),
  };
}

export async function configurePricingSettings(rawInput: unknown) {
  const input = pricingSettingsInputSchema.parse(rawInput);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const codes = input.currencies.map(({ code }) => code);
          const existingCurrencies = await tx.commerceCurrency.findMany({
            where: { code: { in: codes } },
            select: {
              code: true,
              minorUnitDigits: true,
              _count: { select: { prices: true } },
            },
          });

          for (const currency of input.currencies) {
            const existing = existingCurrencies.find(({ code }) => code === currency.code);
            if (existing && existing.minorUnitDigits !== currency.minorUnitDigits && existing._count.prices > 0) {
              throw new HttpError(
                409,
                `Cannot change ${currency.code} minor-unit digits while variant prices use that currency.`,
              );
            }

            await tx.commerceCurrency.upsert({
              where: { code: currency.code },
              update: { minorUnitDigits: currency.minorUnitDigits, isEnabled: true },
              create: { ...currency, isEnabled: true },
            });
          }

          await tx.commerceCurrency.updateMany({
            // Disabling preserves price and rate references that may be needed for history or re-enabling.
            where: { code: { notIn: codes } },
            data: { isEnabled: false },
          });

          // A base-currency change cannot make an existing active variant unpriceable.
          const variantsMissingBasePrice = await tx.productVariant.count({
            where: {
              isActive: true,
              prices: { none: { currencyCode: input.baseCurrency } },
            },
          });

          if (variantsMissingBasePrice > 0) {
            throw new HttpError(
              409,
              `Cannot use ${input.baseCurrency} as the base currency until every active variant has that price.`,
            );
          }

          await tx.commerceSettings.upsert({
            where: { id: COMMERCE_SETTINGS_ID },
            update: {
              baseCurrencyCode: input.baseCurrency,
              rateTtlMinutes: input.rateTtlMinutes,
            },
            create: {
              id: COMMERCE_SETTINGS_ID,
              baseCurrencyCode: input.baseCurrency,
              rateTtlMinutes: input.rateTtlMinutes,
            },
          });
        },
        { isolationLevel: "Serializable", timeout: 15000 },
      );

      return getAdminPricingConfiguration();
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code === "P2002") {
        throw new HttpError(409, "A currency or pricing setting conflicts with existing data. Reload and try again.");
      }
      if (code === "P2034") {
        if (attempt < 2) continue;
        throw new HttpError(409, "Pricing settings changed concurrently. Reload and try again.");
      }
      throw error;
    }
  }

  throw new HttpError(409, "Unable to configure pricing. Try again.");
}

export async function storeExchangeRates(rawInput: unknown) {
  const input = exchangeRatesInputSchema.parse(rawInput);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const settings = await requirePricingSettings(tx);
          const enabledCurrencies = new Set(
            (
              await tx.commerceCurrency.findMany({
                where: { isEnabled: true },
                select: { code: true },
              })
            ).map(({ code }) => code),
          );

          for (const rate of input.rates) {
            if (rate.quoteCurrency === settings.baseCurrencyCode) {
              throw new HttpError(400, "An exchange rate cannot quote the base currency against itself.");
            }
            if (!enabledCurrencies.has(rate.quoteCurrency)) {
              throw new HttpError(400, `Currency ${rate.quoteCurrency} is not enabled for this store.`);
            }
          }

          const fetchedAt = new Date();
          // Storefront reads never contact a provider; freshness is enforced against this database expiry.
          const expiresAt = new Date(fetchedAt.getTime() + settings.rateTtlMinutes * 60_000);

          for (const rate of input.rates) {
            await tx.exchangeRate.upsert({
              where: {
                baseCurrencyCode_quoteCurrencyCode: {
                  baseCurrencyCode: settings.baseCurrencyCode,
                  quoteCurrencyCode: rate.quoteCurrency,
                },
              },
              update: {
                rate: rate.rate,
                provider: input.provider,
                fetchedAt,
                expiresAt,
              },
              create: {
                baseCurrencyCode: settings.baseCurrencyCode,
                quoteCurrencyCode: rate.quoteCurrency,
                rate: rate.rate,
                provider: input.provider,
                fetchedAt,
                expiresAt,
              },
            });
          }
        },
        { isolationLevel: "Serializable", timeout: 15000 },
      );

      return getAdminPricingConfiguration();
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code === "P2034") {
        if (attempt < 2) continue;
        throw new HttpError(409, "Exchange rates changed concurrently. Reload and try again.");
      }
      throw error;
    }
  }

  throw new HttpError(409, "Unable to save exchange rates. Try again.");
}
