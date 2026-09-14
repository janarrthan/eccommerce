import { z } from "zod";

const prismaIntSchema = z.number().int().min(0).max(2_147_483_647);

export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Currency must be a three-letter code.")
  .transform((currency) => currency.toUpperCase());

export const variantPriceInputSchema = z
  .object({
    currency: currencyCodeSchema,
    amountMinor: prismaIntSchema,
  })
  .strict();

const configuredCurrencySchema = z
  .object({
    code: currencyCodeSchema,
    // This implementation supports currency scales from whole units through four decimal places.
    minorUnitDigits: z.number().int().min(0).max(4),
  })
  .strict();

export const pricingSettingsInputSchema = z
  .object({
    baseCurrency: currencyCodeSchema,
    currencies: z.array(configuredCurrencySchema).min(1).max(50),
    rateTtlMinutes: z
      .number()
      .int()
      .min(5)
      .max(7 * 24 * 60),
  })
  .strict()
  .superRefine((input, ctx) => {
    const codes = input.currencies.map(({ code }) => code);

    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currencies"],
        message: "Configured currency codes must be unique.",
      });
    }

    if (!codes.includes(input.baseCurrency)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseCurrency"],
        message: "The base currency must also be enabled.",
      });
    }
  });

const positiveDecimalStringSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,12})?$/,
    "Rate must be a positive decimal string with at most 12 integer and 12 fractional digits.",
  )
  .refine((rate) => /[1-9]/.test(rate), "Rate must be greater than zero.");

export const exchangeRatesInputSchema = z
  .object({
    provider: z.string().trim().min(1).max(100),
    rates: z
      .array(
        z
          .object({
            quoteCurrency: currencyCodeSchema,
            // A string avoids losing provider precision in JSON number parsing.
            rate: positiveDecimalStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(49),
  })
  .strict()
  .superRefine((input, ctx) => {
    const codes = input.rates.map(({ quoteCurrency }) => quoteCurrency);

    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rates"],
        message: "Each quote currency may appear only once.",
      });
    }
  });

export const storefrontCurrencyQuerySchema = z
  .object({
    currency: currencyCodeSchema.optional(),
  })
  .strict();

export type PricingSettingsInput = z.infer<typeof pricingSettingsInputSchema>;
export type ExchangeRatesInput = z.infer<typeof exchangeRatesInputSchema>;
export type VariantPriceInput = z.infer<typeof variantPriceInputSchema>;
