/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `priceCents` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stock` on the `Product` table. All the data in the column will be lost.

*/
BEGIN;

-- CreateTable
CREATE TABLE "ProductVariantPrice" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariantPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "baseCurrencyCode" VARCHAR(3) NOT NULL,
    "quoteCurrencyCode" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(24,12) NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("baseCurrencyCode","quoteCurrencyCode")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantImage" (
    "variantId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductVariantImage_pkey" PRIMARY KEY ("variantId","imageId")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantOptionValue" (
    "variantId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantOptionValue_pkey" PRIMARY KEY ("variantId","optionId")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "sku" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "optionKey" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- Establish a check constraint to prevent negative stock values in the `ProductVariant` table.
ALTER TABLE "ProductVariant"
ADD CONSTRAINT "ProductVariant_stock_nonnegative_check"
CHECK ("stock" >= 0);

-- Establish a check constraint to prevent negative price values in the `ProductVariantPrice` table.
ALTER TABLE "ProductVariantPrice"
ADD CONSTRAINT "ProductVariantPrice_amountMinor_nonnegative_check"
CHECK ("amountMinor" >= 0);

-- CreateIndex
CREATE INDEX "ProductVariantPrice_currencyCode_idx" ON "ProductVariantPrice"("currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariantPrice_variantId_currencyCode_key" ON "ProductVariantPrice"("variantId", "currencyCode");

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrencyCode_expiresAt_idx" ON "ExchangeRate"("baseCurrencyCode", "expiresAt");

-- CreateIndex
CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductVariantImage_variantId_position_idx" ON "ProductVariantImage"("variantId", "position");

-- CreateIndex
CREATE INDEX "ProductVariantImage_imageId_idx" ON "ProductVariantImage"("imageId");

-- CreateIndex
CREATE INDEX "ProductOption_productId_position_idx" ON "ProductOption"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_name_key" ON "ProductOption"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_optionId_value_key" ON "ProductOptionValue"("optionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_id_optionId_key" ON "ProductOptionValue"("id", "optionId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_valueId_optionId_idx" ON "ProductVariantOptionValue"("valueId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_optionKey_key" ON "ProductVariant"("productId", "optionKey");

-- AddForeignKey
ALTER TABLE "ProductVariantPrice" ADD CONSTRAINT "ProductVariantPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantPrice" ADD CONSTRAINT "ProductVariantPrice_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "CommerceCurrency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_baseCurrencyCode_fkey" FOREIGN KEY ("baseCurrencyCode") REFERENCES "CommerceCurrency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_quoteCurrencyCode_fkey" FOREIGN KEY ("quoteCurrencyCode") REFERENCES "CommerceCurrency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantImage" ADD CONSTRAINT "ProductVariantImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantImage" ADD CONSTRAINT "ProductVariantImage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_valueId_optionId_fkey" FOREIGN KEY ("valueId", "optionId") REFERENCES "ProductOptionValue"("id", "optionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Require valid legacy pricing configuration before migrating products.
DO $$
  BEGIN
      IF EXISTS (
          SELECT 1
          FROM "Product"
      )
      AND NOT EXISTS (
          SELECT 1
          FROM "CommerceSettings" AS settings
          INNER JOIN "CommerceCurrency" AS currency
              ON currency."code" = settings."baseCurrencyCode"
          WHERE settings."id" = 'default'
              AND currency."minorUnitDigits" = 2
              AND currency."isEnabled" IS true
      ) THEN
          RAISE EXCEPTION
              'Catalog migration aborted: legacy products exist without valid base-currency settings';
      END IF;

      IF EXISTS (
          SELECT 1
          FROM "Product"
          WHERE "priceCents" < 0 OR "stock" < 0
      ) THEN
          RAISE EXCEPTION
              'Catalog migration aborted: legacy products contain negative price or stock values';
      END IF;
  END
$$;

-- Preserve each legacy product's stock in a default variant.
INSERT INTO "ProductVariant" (
    "id",
    "productId",
    "name",
    "sku",
    "stock",
    "isActive",
    "optionKey",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-variant-' || product."id",
    product."id",
    'Default',
    'LEGACY-' || product."id",
    product."stock",
    true,
    NULL,
    product."createdAt",
    product."updatedAt"
FROM "Product" AS product;

-- Preserve each legacy product's price in the preserved base currency.
INSERT INTO "ProductVariantPrice" (
    "id",
    "variantId",
    "currencyCode",
    "amountMinor",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-price-' || product."id",
    'legacy-variant-' || product."id",
    settings."baseCurrencyCode",
    product."priceCents",
    product."createdAt",
    product."updatedAt"
FROM "Product" AS product
CROSS JOIN "CommerceSettings" AS settings
WHERE settings."id" = 'default';

-- Preserve each nonblank legacy image as the product-level fallback image.
INSERT INTO "ProductImage" (
    "id",
    "productId",
    "url",
    "altText",
    "position",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-image-' || product."id",
    product."id",
    product."imageUrl",
    product."name",
    0,
    product."createdAt",
    product."updatedAt"
FROM "Product" AS product
WHERE product."imageUrl" IS NOT NULL
AND BTRIM(product."imageUrl") <> '';

-- Abort before dropping legacy columns if any value was not preserved.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Product" AS product
        LEFT JOIN "ProductVariant" AS variant
            ON variant."id" = 'legacy-variant-' || product."id"
        WHERE variant."id" IS NULL
            OR variant."productId" <> product."id"
            OR variant."stock" <> product."stock"
            OR variant."sku" <> 'LEGACY-' || product."id"
            OR variant."isActive" IS NOT true
    ) THEN
        RAISE EXCEPTION 'Catalog migration aborted: variant stock backfill verification failed';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "Product" AS product
        LEFT JOIN "ProductVariantPrice" AS price
            ON price."id" = 'legacy-price-' || product."id"
        WHERE price."id" IS NULL
            OR price."variantId" <> 'legacy-variant-' || product."id"
            OR price."currencyCode" <> (
                SELECT settings."baseCurrencyCode"
                FROM "CommerceSettings" AS settings
                WHERE settings."id" = 'default'
            )
            OR price."amountMinor" <> product."priceCents"
    ) THEN
        RAISE EXCEPTION 'Catalog migration aborted: variant price backfill verification failed';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "Product" AS product
        LEFT JOIN "ProductImage" AS image
            ON image."id" = 'legacy-image-' || product."id"
        WHERE product."imageUrl" IS NOT NULL
        AND BTRIM(product."imageUrl") <> ''
        AND (
            image."id" IS NULL
            OR image."productId" <> product."id"
            OR image."url" <> product."imageUrl"
            OR image."position" <> 0
        )
    ) THEN
        RAISE EXCEPTION 'Catalog migration aborted: product image backfill verification failed';
    END IF;
END
$$;

-- Remove legacy columns only after their values have been copied and verified.
ALTER TABLE "Product"
DROP COLUMN "imageUrl",
DROP COLUMN "priceCents",
DROP COLUMN "stock";

COMMIT;
