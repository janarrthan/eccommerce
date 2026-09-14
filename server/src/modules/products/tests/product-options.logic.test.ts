import { describe, expect, it } from "vitest";

import { getOptionKey, validateOptionConfiguration, validateSelectedValueIds } from "../product-options.logic.js";
import {
  productOptionsInputSchema,
  resolveVariantQuerySchema,
  type ProductOptionsInput,
} from "../product-options.validation.js";

const options = [
  {
    name: "Size",
    values: [{ value: "Medium" }, { value: "Large" }],
  },
  {
    name: "Color",
    values: [{ value: "Blue" }, { value: "Black" }],
  },
];
const selections = [
  { option: "Size", value: "Large" },
  { option: "Color", value: "Blue" },
];
const noExistingCatalog = { options: [], variants: [] };

function newVariant(
  sku: string,
  variantSelections: ProductOptionsInput["variants"][number]["selections"],
): ProductOptionsInput["variants"][number] {
  return {
    name: sku,
    sku,
    prices: [{ currency: "USD", amountMinor: 5000 }],
    stock: 2,
    selections: variantSelections,
  };
}

describe("product option configuration", () => {
  it("accepts arbitrary option names and an explicit subset of combinations", () => {
    expect(() =>
      validateOptionConfiguration(
        {
          options: [
            {
              name: "Storage",
              values: [{ value: "128GB" }, { value: "256GB" }],
            },
            {
              name: "Finish",
              values: [{ value: "Matte" }, { value: "Gloss" }],
            },
          ],
          variants: [
            newVariant("PHONE-128-MATTE", [
              { option: "Storage", value: "128GB" },
              { option: "Finish", value: "Matte" },
            ]),
          ],
        },
        noExistingCatalog,
      ),
    ).not.toThrow();
  });

  it("rejects duplicate combinations even when selections are reordered", () => {
    expect(() =>
      validateOptionConfiguration(
        {
          options,
          variants: [newVariant("A", selections), newVariant("B", [...selections].reverse())],
        },
        noExistingCatalog,
      ),
    ).toThrow("already uses this option combination");
  });

  it.each([
    { variantSelections: [selections[0]], message: "exactly one value" },
    {
      variantSelections: [selections[0], selections[0]],
      message: "only one value",
    },
    {
      variantSelections: [{ option: "Size", value: "Unknown" }, selections[1]],
      message: "belong to the product",
    },
    {
      variantSelections: [{ option: "Storage", value: "Large" }, selections[1]],
      message: "belong to the product",
    },
  ])("rejects invalid selections $variantSelections", ({ variantSelections, message }) => {
    expect(() =>
      validateOptionConfiguration(
        {
          options,
          variants: [newVariant("A", variantSelections)],
        },
        noExistingCatalog,
      ),
    ).toThrow(message);
  });

  it("allows omitted existing variants but rejects foreign or repeated IDs", () => {
    const existing = {
      options: [],
      variants: [{ id: "a", sku: "A" }],
    };
    expect(() => validateOptionConfiguration({ options, variants: [] }, existing)).not.toThrow();
    expect(() =>
      validateOptionConfiguration(
        {
          options,
          variants: [{ id: "foreign", selections }],
        },
        existing,
      ),
    ).toThrow("belong to this product");
    expect(() =>
      validateOptionConfiguration(
        {
          options,
          variants: [
            { id: "a", selections },
            { id: "a", selections: [...selections].reverse() },
          ],
        },
        existing,
      ),
    ).toThrow("appear only once");
  });

  it("validates stable option and value IDs against their product and parent", () => {
    const existing = {
      options: [
        {
          id: "size",
          values: [{ id: "medium" }, { id: "large" }],
        },
      ],
      variants: [],
    };
    expect(() =>
      validateOptionConfiguration(
        {
          options: [
            {
              id: "size",
              name: "Fit",
              values: [
                { id: "medium", value: "Regular" },
                { id: "large", value: "Large" },
              ],
            },
          ],
          variants: [],
        },
        existing,
      ),
    ).not.toThrow();
    expect(() =>
      validateOptionConfiguration(
        {
          options: [
            {
              id: "foreign",
              name: "Size",
              values: [{ value: "Large" }],
            },
          ],
          variants: [],
        },
        existing,
      ),
    ).toThrow("option ID must belong");
    expect(() =>
      validateOptionConfiguration(
        {
          options: [
            {
              id: "size",
              name: "Size",
              values: [{ id: "foreign", value: "Large" }],
            },
          ],
          variants: [],
        },
        existing,
      ),
    ).toThrow("value ID must belong");
    expect(() =>
      validateOptionConfiguration(
        {
          options: [
            {
              name: "Size",
              values: [{ id: "medium", value: "Medium" }],
            },
          ],
          variants: [],
        },
        existing,
      ),
    ).toThrow("requires its existing option ID");
  });

  it("rejects duplicate option labels and values ignoring case", () => {
    expect(() =>
      validateOptionConfiguration(
        {
          options: [...options, { name: "size", values: [{ value: "Small" }] }],
          variants: [],
        },
        noExistingCatalog,
      ),
    ).toThrow("names must be unique");
    expect(() =>
      validateOptionConfiguration(
        {
          options: [
            {
              name: "Size",
              values: [{ value: "Large" }, { value: "large" }],
            },
          ],
          variants: [],
        },
        noExistingCatalog,
      ),
    ).toThrow("Values must be unique");
  });

  it("rejects duplicate SKUs and SKUs owned by a different existing variant", () => {
    expect(() =>
      validateOptionConfiguration(
        {
          options,
          variants: [
            newVariant("DUPLICATE", selections),
            newVariant("DUPLICATE", [
              { option: "Size", value: "Medium" },
              { option: "Color", value: "Black" },
            ]),
          ],
        },
        noExistingCatalog,
      ),
    ).toThrow("unique SKU");
    expect(() =>
      validateOptionConfiguration(
        {
          options,
          variants: [{ id: "a", sku: "B", selections }],
        },
        {
          options: [],
          variants: [
            { id: "a", sku: "A" },
            { id: "b", sku: "B" },
          ],
        },
      ),
    ).toThrow("unique SKU");
  });

  it("allows one default variant without options, but rejects duplicate defaults", () => {
    expect(() =>
      validateOptionConfiguration({ options: [], variants: [newVariant("A", [])] }, noExistingCatalog),
    ).not.toThrow();
    expect(() =>
      validateOptionConfiguration(
        {
          options: [],
          variants: [newVariant("A", []), newVariant("B", [])],
        },
        noExistingCatalog,
      ),
    ).toThrow("already uses");
  });

  it("normalizes labels and price currencies and rejects malformed bodies", () => {
    expect(
      productOptionsInputSchema.parse({
        options: [{ name: " Size ", values: [{ value: " Large " }] }],
        variants: [
          {
            name: " Large ",
            sku: " SKU-L ",
            prices: [{ currency: " usd ", amountMinor: 5000 }],
            stock: 2,
            selections: [{ option: " Size ", value: " Large " }],
          },
        ],
      }),
    ).toMatchObject({
      options: [{ name: "Size", values: [{ value: "Large" }] }],
      variants: [
        {
          name: "Large",
          sku: "SKU-L",
          prices: [{ currency: "USD", amountMinor: 5000 }],
          selections: [{ option: "Size", value: "Large" }],
        },
      ],
    });
    expect(
      productOptionsInputSchema.safeParse({
        options: [{ name: "Size", values: [] }],
        variants: [],
      }).success,
    ).toBe(false);
    expect(
      productOptionsInputSchema.safeParse({
        options: [],
        variants: [{ name: "Default", sku: "DEFAULT", selections: [] }],
      }).success,
    ).toBe(false);
    expect(
      productOptionsInputSchema.safeParse({
        options: [],
        variants: [
          {
            name: "Default",
            sku: "DEFAULT",
            prices: [{ currency: "US", amountMinor: -1 }],
            stock: -1,
            selections: [],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      productOptionsInputSchema.safeParse({
        options: [],
        variants: [],
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("customer option selections", () => {
  const definitions = [
    { id: "size", values: [{ id: "large" }, { id: "medium" }] },
    { id: "color", values: [{ id: "blue" }] },
  ];

  it("accepts selections in any order and produces a stable key", () => {
    expect(() => validateSelectedValueIds(definitions, ["blue", "large"])).not.toThrow();
    expect(getOptionKey(["large", "blue"])).toBe(getOptionKey(["blue", "large"]));
    expect(getOptionKey(["medium", "blue"])).not.toBe(getOptionKey(["large", "blue"]));
  });

  it.each([
    [["blue"], "exactly one value"],
    [["large", "medium"], "only one value"],
    [["large", "large"], "only one value"],
    [["large", "other-product-blue"], "belong to the product"],
  ])("rejects invalid selection IDs %j", (ids, message) => {
    expect(() => validateSelectedValueIds(definitions, ids)).toThrow(message);
  });

  it("parses zero, one, and multiple query values, but rejects objects", () => {
    expect(resolveVariantQuerySchema.parse({}).optionValueIds).toEqual([]);
    expect(resolveVariantQuerySchema.parse({ optionValueIds: "blue" }).optionValueIds).toEqual(["blue"]);
    expect(
      resolveVariantQuerySchema.parse({
        optionValueIds: ["blue", "large"],
      }).optionValueIds,
    ).toEqual(["blue", "large"]);
    expect(
      resolveVariantQuerySchema.safeParse({
        optionValueIds: { id: "blue" },
      }).success,
    ).toBe(false);
  });
});
