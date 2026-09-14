-- Ensure existing catalog rows can be assigned during the migration.
INSERT INTO "Store" ("id", "name", "slug", "defaultCurrency", "isActive", "createdAt", "updatedAt")
VALUES ('demo_store', 'Demo Commerce Store', 'demo-store', 'USD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Add nullable columns first so existing rows can be backfilled.
ALTER TABLE "Category" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Product" ADD COLUMN "storeId" TEXT;

UPDATE "Category"
SET "storeId" = (SELECT "id" FROM "Store" WHERE "slug" = 'demo-store' LIMIT 1)
WHERE "storeId" IS NULL;

UPDATE "Product"
SET "storeId" = (SELECT "id" FROM "Store" WHERE "slug" = 'demo-store' LIMIT 1)
WHERE "storeId" IS NULL;

ALTER TABLE "Category" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "storeId" SET NOT NULL;

-- Replace global slug uniqueness with store-scoped slug uniqueness.
DROP INDEX "Category_slug_key";
DROP INDEX "Product_slug_key";

CREATE UNIQUE INDEX "Category_storeId_slug_key" ON "Category"("storeId", "slug");
CREATE UNIQUE INDEX "Product_storeId_slug_key" ON "Product"("storeId", "slug");

CREATE INDEX "Category_storeId_idx" ON "Category"("storeId");
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");

ALTER TABLE "Category"
ADD CONSTRAINT "Category_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
