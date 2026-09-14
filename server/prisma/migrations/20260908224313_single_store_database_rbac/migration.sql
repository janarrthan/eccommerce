/*
  Warnings:

  - You are about to drop the column `storeId` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `storeId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Store` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoreMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoreMemberRoleAssignment` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[slug]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/

BEGIN;

-- Refuse to merge an ambiguous multi-store database automatically.
DO $$
DECLARE
    legacy_store_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO legacy_store_count
    FROM "Store";

    IF legacy_store_count > 1 THEN
        RAISE EXCEPTION
            'Single-store migration cannot automatically merge multiple legacy stores; found %',
            legacy_store_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "Store"
        WHERE UPPER(BTRIM("defaultCurrency")) !~ '^[A-Z]{3}$'
    ) THEN
        RAISE EXCEPTION
            'Single-store migration requires a three-letter legacy currency code';
    END IF;
END
$$;

-- Preserve store-level currency configuration before removing Store.
CREATE TABLE "CommerceCurrency" (
    "code" VARCHAR(3) NOT NULL,
    "minorUnitDigits" INTEGER NOT NULL DEFAULT 2,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceCurrency_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "CommerceSettings" (
    "id" TEXT NOT NULL,
    "baseCurrencyCode" VARCHAR(3) NOT NULL,
    "rateTtlMinutes" INTEGER NOT NULL DEFAULT 1440,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommerceSettings"
ADD CONSTRAINT "CommerceSettings_baseCurrencyCode_fkey"
FOREIGN KEY ("baseCurrencyCode")
REFERENCES "CommerceCurrency"("code")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- priceCents used two decimal places; preserve the store's actual currency code.
INSERT INTO "CommerceCurrency" (
    "code",
    "minorUnitDigits",
    "isEnabled",
    "createdAt",
    "updatedAt"
)
SELECT
    UPPER(BTRIM("defaultCurrency")),
    2,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Store";

INSERT INTO "CommerceSettings" (
    "id",
    "baseCurrencyCode",
    "rateTtlMinutes",
    "updatedAt"
)
SELECT
    'default',
    UPPER(BTRIM("defaultCurrency")),
    1440,
    CURRENT_TIMESTAMP
FROM "Store";

DO $$
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM "Store"
        )
        AND NOT EXISTS (
            SELECT 1
            FROM "Store" AS store
            INNER JOIN "CommerceSettings" AS settings
                ON settings."id" = 'default'
                AND settings."baseCurrencyCode" = UPPER(BTRIM(store."defaultCurrency"))
            INNER JOIN "CommerceCurrency" AS currency
                ON currency."code" = settings."baseCurrencyCode"
                AND currency."minorUnitDigits" = 2
        ) THEN
            RAISE EXCEPTION
                'Single-store migration aborted: legacy currency preservation failed';
        END IF;
    END
$$;

-- Preserve database-backed roles before removing the single-store membership layer.
CREATE TABLE "UserRoleAssignment" (
"userId" TEXT NOT NULL,
"roleId" TEXT NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("userId","roleId")
);

CREATE INDEX "UserRoleAssignment_roleId_idx"
ON "UserRoleAssignment"("roleId");

ALTER TABLE "UserRoleAssignment"
ADD CONSTRAINT "UserRoleAssignment_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "UserRoleAssignment"
ADD CONSTRAINT "UserRoleAssignment_roleId_fkey"
FOREIGN KEY ("roleId")
REFERENCES "Role"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

INSERT INTO "UserRoleAssignment" (
"userId",
"roleId",
"createdAt"
)
SELECT
member."userId",
assignment."roleId",
assignment."createdAt"
FROM "StoreMemberRoleAssignment" AS assignment
INNER JOIN "StoreMember" AS member
ON member."id" = assignment."storeMemberId";

DO $$
    BEGIN
    IF EXISTS (
        SELECT 1
        FROM "StoreMemberRoleAssignment" AS legacy_assignment
        INNER JOIN "StoreMember" AS member
            ON member."id" = legacy_assignment."storeMemberId"
        LEFT JOIN "UserRoleAssignment" AS migrated_assignment
            ON migrated_assignment."userId" = member."userId"
            AND migrated_assignment."roleId" = legacy_assignment."roleId"
        WHERE migrated_assignment."userId" IS NULL
    ) THEN
        RAISE EXCEPTION
            'Single-store migration aborted: role-assignment backfill verification failed';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "User" AS legacy_admin
        WHERE legacy_admin."role" = 'ADMIN'
        AND NOT EXISTS (
            SELECT 1
            FROM "UserRoleAssignment" AS migrated_assignment
            WHERE migrated_assignment."userId" = legacy_admin."id"
        )
    ) THEN
        RAISE EXCEPTION
            'Single-store migration aborted: a legacy admin has no database-backed role assignment';
    END IF;
END
$$;

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreMember" DROP CONSTRAINT "StoreMember_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreMember" DROP CONSTRAINT "StoreMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "StoreMemberRoleAssignment" DROP CONSTRAINT "StoreMemberRoleAssignment_roleId_fkey";

-- DropForeignKey
ALTER TABLE "StoreMemberRoleAssignment" DROP CONSTRAINT "StoreMemberRoleAssignment_storeMemberId_fkey";

-- DropIndex
DROP INDEX "Category_storeId_idx";

-- DropIndex
DROP INDEX "Category_storeId_slug_key";

-- DropIndex
DROP INDEX "Product_storeId_idx";

-- DropIndex
DROP INDEX "Product_storeId_slug_key";

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "storeId";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "storeId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role";

-- DropTable
DROP TABLE "Store";

-- DropTable
DROP TABLE "StoreMember";

-- DropTable
DROP TABLE "StoreMemberRoleAssignment";

-- DropEnum
DROP TYPE "UserRole";

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

COMMIT;