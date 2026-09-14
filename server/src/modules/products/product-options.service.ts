import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { COMMERCE_SETTINGS_ID } from "../pricing/pricing.constants.js";
import { validateVariantPriceConfiguration } from "../pricing/pricing.logic.js";
import { getOptionKey, validateOptionConfiguration } from "./product-options.logic.js";
import { productOptionsInputSchema } from "./product-options.validation.js";
import { adminProductVariantSelect, productOptionsSelect } from "./products.service.js";

export async function configureProductOptions(productId: string, rawInput: unknown) {
  const input = productOptionsInputSchema.parse(rawInput);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // All option configuration writes lock the parent product before reading variants.
          const product = await tx.product.update({
            where: { id: productId },
            data: { updatedAt: new Date() },
            select: {
              options: {
                select: {
                  id: true,
                  name: true,
                  values: { select: { id: true, value: true } },
                },
              },
              variants: {
                select: {
                  id: true,
                  sku: true,
                  prices: { select: { currencyCode: true } },
                },
              },
            },
          });

          validateOptionConfiguration(input, product);

          const pricingSettings = await tx.commerceSettings.findUnique({
            where: { id: COMMERCE_SETTINGS_ID },
            select: { baseCurrencyCode: true },
          });

          const enabledCurrencies = await tx.commerceCurrency.findMany({
            where: { isEnabled: true },
            select: { code: true },
          });

          if (!pricingSettings) {
            throw new HttpError(503, "Commerce pricing has not been configured.");
          }

          validateVariantPriceConfiguration(
            input.variants,
            product.variants,
            pricingSettings.baseCurrencyCode,
            new Set(enabledCurrencies.map(({ code }) => code)),
          );

          // Omitted variants are archived. Submitted existing variants are reactivated below.
          await tx.productVariant.updateMany({
            where: { productId },
            data: { isActive: false, optionKey: null },
          });

          await tx.productVariantOptionValue.deleteMany({
            where: { variant: { productId } },
          });

          const existingOptionById = new Map(product.options.map((option) => [option.id, option] as const));
          const existingOptionByName = new Map(product.options.map((option) => [option.name, option] as const));
          const retainedOptionIds = input.options.flatMap((option) => {
            const existingOption = option.id
              ? existingOptionById.get(option.id)
              : existingOptionByName.get(option.name);
            return existingOption ? [existingOption.id] : [];
          });
          await tx.productOption.deleteMany({
            where: {
              productId,
              ...(retainedOptionIds.length > 0 ? { id: { notIn: retainedOptionIds } } : {}),
            },
          });

          const savedSelections = new Map<string, Map<string, { optionId: string; valueId: string }>>();
          const optionIds: string[] = [];

          for (const [position, option] of input.options.entries()) {
            const existingOption = option.id
              ? existingOptionById.get(option.id)
              : existingOptionByName.get(option.name);

            const savedOption = option.id
              ? await tx.productOption.update({
                  where: { id: option.id },
                  data: { name: option.name, position },
                })
              : await tx.productOption.upsert({
                  where: {
                    productId_name: { productId, name: option.name },
                  },
                  update: { position },
                  create: { productId, name: option.name, position },
                });

            optionIds.push(savedOption.id);

            const existingValueById = new Map(existingOption?.values.map((value) => [value.id, value] as const));
            const existingValueByName = new Map(existingOption?.values.map((value) => [value.value, value] as const));

            const retainedValueIds = option.values.flatMap((value) => {
              const existingValue = value.id ? existingValueById.get(value.id) : existingValueByName.get(value.value);
              return existingValue ? [existingValue.id] : [];
            });

            await tx.productOptionValue.deleteMany({
              where: {
                optionId: savedOption.id,
                ...(retainedValueIds.length > 0 ? { id: { notIn: retainedValueIds } } : {}),
              },
            });

            const values = new Map<string, { optionId: string; valueId: string }>();

            for (const [valuePosition, valueInput] of option.values.entries()) {
              const savedValue = valueInput.id
                ? await tx.productOptionValue.update({
                    where: { id: valueInput.id },
                    data: {
                      value: valueInput.value,
                      position: valuePosition,
                    },
                  })
                : await tx.productOptionValue.upsert({
                    where: {
                      optionId_value: {
                        optionId: savedOption.id,
                        value: valueInput.value,
                      },
                    },
                    update: { position: valuePosition },
                    create: {
                      optionId: savedOption.id,
                      value: valueInput.value,
                      position: valuePosition,
                    },
                  });
              values.set(valueInput.value, {
                optionId: savedOption.id,
                valueId: savedValue.id,
              });
            }
            savedSelections.set(option.name, values);
          }

          await tx.productOption.deleteMany({
            where: { productId, id: { notIn: optionIds } },
          });

          for (const variant of input.variants) {
            const selections = variant.selections.map(({ option, value }) => {
              const selection = savedSelections.get(option)?.get(value);
              if (!selection) {
                throw new HttpError(400, "Selected values must belong to the product's options.");
              }
              return selection;
            });

            const selectionData = selections.length > 0 ? { optionValues: { create: selections } } : {};
            const optionKey = getOptionKey(selections.map(({ valueId }) => valueId));

            if (variant.id !== undefined) {
              await tx.productVariant.update({
                where: { id: variant.id },
                data: {
                  isActive: true,
                  optionKey,
                  ...(variant.name !== undefined ? { name: variant.name } : {}),
                  ...(variant.sku !== undefined ? { sku: variant.sku } : {}),
                  ...(variant.prices !== undefined
                    ? {
                        prices: {
                          deleteMany: {},
                          create: variant.prices.map(({ currency, amountMinor }) => ({
                            currencyCode: currency,
                            amountMinor,
                          })),
                        },
                      }
                    : {}),
                  ...(variant.stock !== undefined ? { stock: variant.stock } : {}),
                  ...selectionData,
                },
              });
            } else {
              // The new-variant schema requires prices; this guard also keeps the service safe if the schema changes later.
              if (!variant.prices) {
                throw new HttpError(400, "Every new variant requires at least one price.");
              }
              await tx.productVariant.create({
                data: {
                  productId,
                  name: variant.name,
                  sku: variant.sku,
                  stock: variant.stock,
                  isActive: true,
                  optionKey,
                  prices: {
                    create: variant.prices.map(({ currency, amountMinor }) => ({
                      currencyCode: currency,
                      amountMinor,
                    })),
                  },
                  ...selectionData,
                },
              });
            }
          }

          return tx.product.findUniqueOrThrow({
            where: { id: productId },
            select: {
              id: true,
              options: productOptionsSelect,
              variants: {
                orderBy: [{ isActive: "desc" }, { sku: "asc" }],
                select: adminProductVariantSelect,
              },
            },
          });
        },
        { isolationLevel: "Serializable", timeout: 15000 },
      );
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code === "P2025") {
        throw new HttpError(404, "Product not found.");
      }
      if (code === "P2002") {
        throw new HttpError(409, "A catalog label, SKU, or option combination is already in use.");
      }
      if (code === "P2034") {
        if (attempt < 2) continue;
        throw new HttpError(409, "Product options changed concurrently. Reload and try again.");
      }
      throw error;
    }
  }
  throw new HttpError(409, "Unable to configure product options. Try again.");
}
