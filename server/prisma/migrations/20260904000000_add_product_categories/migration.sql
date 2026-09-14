-- Create the explicit join table for the Product <-> Category many-to-many relationship.
CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId", "categoryId")
);

-- Preserve every existing product's category assignment before removing Product.categoryId.
INSERT INTO "ProductCategory" ("productId", "categoryId")
SELECT "id", "categoryId"
FROM "Product";

CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");

ALTER TABLE "ProductCategory"
ADD CONSTRAINT "ProductCategory_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductCategory"
ADD CONSTRAINT "ProductCategory_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";
DROP INDEX "Product_categoryId_idx";
ALTER TABLE "Product" DROP COLUMN "categoryId";
