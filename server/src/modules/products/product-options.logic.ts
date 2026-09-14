import { createHash } from "node:crypto";

import { HttpError } from "../../shared/errors/http-error.js";
import type { ProductOptionsInput } from "./product-options.validation.js";

export function getOptionKey(valueIds: readonly string[]) {
  return createHash("sha256")
    .update(JSON.stringify([...valueIds].sort()))
    .digest("hex");
}

type ExistingProductConfiguration = {
  options: readonly {
    id: string;
    values: readonly { id: string }[];
  }[];
  variants: readonly { id: string; sku: string }[];
};

export function validateOptionConfiguration(input: ProductOptionsInput, existing: ExistingProductConfiguration) {
  const options = new Map<string, Set<string>>();
  const optionNames = new Set<string>();
  const existingOptionById = new Map(existing.options.map((option) => [option.id, option] as const));
  const usedOptionIds = new Set<string>();
  const usedValueIds = new Set<string>();

  for (const option of input.options) {
    const nameKey = option.name.toLowerCase();

    if (optionNames.has(nameKey)) {
      throw new HttpError(400, "Product option names must be unique.");
    }

    optionNames.add(nameKey);

    const existingOption = option.id ? existingOptionById.get(option.id) : undefined;

    if (option.id && (!existingOption || usedOptionIds.has(option.id))) {
      throw new HttpError(400, "Each option ID must belong to this product and appear only once.");
    }

    if (option.id) usedOptionIds.add(option.id);

    const existingValueIds = new Set(existingOption?.values.map(({ id }) => id) ?? []);
    const valueKeys = option.values.map(({ value }) => value.toLowerCase());
    if (new Set(valueKeys).size !== valueKeys.length) {
      throw new HttpError(400, "Values must be unique within each option.");
    }

    for (const value of option.values) {
      if (value.id && !option.id) {
        throw new HttpError(400, "An existing value ID requires its existing option ID.");
      }

      if (value.id && (!existingValueIds.has(value.id) || usedValueIds.has(value.id))) {
        throw new HttpError(400, "Each value ID must belong to its option and appear only once.");
      }

      if (value.id) usedValueIds.add(value.id);
    }

    options.set(option.name, new Set(option.values.map(({ value }) => value)));
  }

  const existingVariantById = new Map(existing.variants.map((variant) => [variant.id, variant] as const));
  const existingVariantBySku = new Map(existing.variants.map((variant) => [variant.sku, variant] as const));
  const usedVariantIds = new Set<string>();
  const usedSkus = new Set<string>();
  const combinations = new Set<string>();

  for (const variant of input.variants) {
    const existingVariant = variant.id ? existingVariantById.get(variant.id) : undefined;

    if (variant.id && (!existingVariant || usedVariantIds.has(variant.id))) {
      throw new HttpError(400, "Each variant ID must belong to this product and appear only once.");
    }
    if (variant.id) usedVariantIds.add(variant.id);

    const sku = variant.sku ?? existingVariant?.sku;
    if (!sku) {
      throw new HttpError(400, "Every new variant requires a SKU.");
    }

    const skuOwner = existingVariantBySku.get(sku);
    if (usedSkus.has(sku) || (skuOwner && skuOwner.id !== variant.id)) {
      throw new HttpError(409, "Each variant must use a unique SKU.");
    }
    usedSkus.add(sku);

    const selectedOptions = new Set<string>();

    for (const selection of variant.selections) {
      if (!options.get(selection.option)?.has(selection.value)) {
        throw new HttpError(400, "Selected values must belong to the product's options.");
      }
      if (selectedOptions.has(selection.option)) {
        throw new HttpError(400, "Select only one value per option.");
      }
      selectedOptions.add(selection.option);
    }

    if (selectedOptions.size !== options.size) {
      throw new HttpError(400, "Select exactly one value for every product option.");
    }

    const combination = JSON.stringify(
      [...variant.selections]
        .sort((a, b) => (a.option < b.option ? -1 : a.option > b.option ? 1 : 0))
        .map(({ option, value }) => [option, value]),
    );

    if (combinations.has(combination)) {
      throw new HttpError(409, "A variant already uses this option combination.");
    }
    combinations.add(combination);
  }
}

type OptionDefinition = { id: string; values: { id: string }[] };

export function validateSelectedValueIds(options: readonly OptionDefinition[], valueIds: readonly string[]) {
  const optionByValueId = new Map(
    options.flatMap((option) => option.values.map((value) => [value.id, option.id] as const)),
  );

  const selectedOptions = new Set<string>();

  for (const valueId of valueIds) {
    const optionId = optionByValueId.get(valueId);

    if (!optionId) {
      throw new HttpError(400, "Selected values must belong to the product's options.");
    }

    if (selectedOptions.has(optionId)) {
      throw new HttpError(400, "Select only one value per option.");
    }

    selectedOptions.add(optionId);
  }

  if (selectedOptions.size !== options.length) {
    throw new HttpError(400, "Select exactly one value for every product option.");
  }
}
