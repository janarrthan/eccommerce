-- CreateEnum
CREATE TYPE "PromotionBenefitType" AS ENUM ('PRODUCT_DISCOUNT', 'ORDER_DISCOUNT', 'BUY_X_GET_Y', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "PromotionActivationMethod" AS ENUM ('AUTOMATIC', 'DISCOUNT_CODE');

-- CreateEnum
CREATE TYPE "PromotionRevisionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PromotionCalculationMethod" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PromotionFixedApplicationMode" AS ENUM ('ONCE_PER_ORDER', 'PER_ELIGIBLE_UNIT');

-- CreateEnum
CREATE TYPE "PromotionTargetMode" AS ENUM ('ALL_PRODUCTS', 'SPECIFIC_MERCHANDISE');

-- CreateEnum
CREATE TYPE "PromotionProductMinimumMode" AS ENUM ('NONE', 'ELIGIBLE_MERCHANDISE_AMOUNT', 'ELIGIBLE_UNIT_QUANTITY');

-- CreateEnum
CREATE TYPE "PromotionOrderMinimumMode" AS ENUM ('NONE', 'MERCHANDISE_SUBTOTAL', 'MERCHANDISE_UNIT_QUANTITY');

-- CreateEnum
CREATE TYPE "PromotionBuyRequirementMode" AS ENUM ('ELIGIBLE_QUANTITY', 'ELIGIBLE_MERCHANDISE_AMOUNT');

-- CreateEnum
CREATE TYPE "PromotionRewardMethod" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE');

-- CreateEnum
CREATE TYPE "PromotionApplicationFrequency" AS ENUM ('ONCE_PER_ORDER', 'REPEAT_FOR_EVERY_REQUIREMENT');

-- CreateEnum
CREATE TYPE "PromotionDestinationMode" AS ENUM ('ALL_SERVICEABLE_COUNTRIES', 'SELECTED_COUNTRIES', 'SHIPPING_ZONES');

-- CreateEnum
CREATE TYPE "PromotionShippingMinimumMode" AS ENUM ('NONE', 'MERCHANDISE_SUBTOTAL', 'MERCHANDISE_UNIT_QUANTITY');

-- CreateEnum
CREATE TYPE "PromotionAmountPurpose" AS ENUM ('BENEFIT_FIXED', 'MINIMUM_PURCHASE', 'MAXIMUM_DISCOUNT', 'SHIPPING_RATE_CEILING');

-- CreateEnum
CREATE TYPE "PromotionTargetRole" AS ENUM ('PRODUCT_DISCOUNT', 'BOGO_BUYS', 'BOGO_GETS');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "internalName" VARCHAR(200) NOT NULL,
    "firstPublishedAt" TIMESTAMPTZ(3),
    "disabledAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRevision" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PromotionRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "authoredTimeZone" VARCHAR(100) NOT NULL,
    "redemptionLimit" INTEGER,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CampaignRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignCurrencyBudget" (
    "campaignRevisionId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "spendLimitMinor" INTEGER NOT NULL,

    CONSTRAINT "CampaignCurrencyBudget_pkey" PRIMARY KEY ("campaignRevisionId","currencyCode")
);

-- CreateTable
CREATE TABLE "PromotionAuditEvent" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT,
    "revisionId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(1000),
    "correlationId" VARCHAR(128) NOT NULL,
    "changeSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAuditEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "revisionId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(1000),
    "correlationId" VARCHAR(128) NOT NULL,
    "changeSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDiscountRule" (
    "revisionId" TEXT NOT NULL,
    "calculationMethod" "PromotionCalculationMethod" NOT NULL,
    "fixedApplicationMode" "PromotionFixedApplicationMode",
    "targetMode" "PromotionTargetMode" NOT NULL,
    "minimumMode" "PromotionProductMinimumMode" NOT NULL DEFAULT 'NONE',
    "percentageBasisPoints" INTEGER,
    "minimumQuantity" INTEGER,

    CONSTRAINT "ProductDiscountRule_pkey" PRIMARY KEY ("revisionId")
);

-- CreateTable
CREATE TABLE "OrderDiscountRule" (
    "revisionId" TEXT NOT NULL,
    "calculationMethod" "PromotionCalculationMethod" NOT NULL,
    "minimumMode" "PromotionOrderMinimumMode" NOT NULL DEFAULT 'NONE',
    "percentageBasisPoints" INTEGER,
    "minimumQuantity" INTEGER,

    CONSTRAINT "OrderDiscountRule_pkey" PRIMARY KEY ("revisionId")
);

-- CreateTable
CREATE TABLE "BuyXGetYRule" (
    "revisionId" TEXT NOT NULL,
    "requirementMode" "PromotionBuyRequirementMode" NOT NULL,
    "qualifyingQuantity" INTEGER,
    "rewardQuantity" INTEGER NOT NULL,
    "rewardMethod" "PromotionRewardMethod" NOT NULL,
    "rewardPercentageBasisPoints" INTEGER,
    "frequency" "PromotionApplicationFrequency" NOT NULL DEFAULT 'ONCE_PER_ORDER',
    "maximumUsesPerOrder" INTEGER,

    CONSTRAINT "BuyXGetYRule_pkey" PRIMARY KEY ("revisionId")
);

-- CreateTable
CREATE TABLE "FreeShippingRule" (
    "revisionId" TEXT NOT NULL,
    "destinationMode" "PromotionDestinationMode" NOT NULL,
    "minimumMode" "PromotionShippingMinimumMode" NOT NULL DEFAULT 'NONE',
    "minimumQuantity" INTEGER,

    CONSTRAINT "FreeShippingRule_pkey" PRIMARY KEY ("revisionId")
);

-- CreateTable
CREATE TABLE "PromotionShippingCountry" (
    "revisionId" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,

    CONSTRAINT "PromotionShippingCountry_pkey" PRIMARY KEY ("revisionId","countryCode")
);

-- CreateTable
CREATE TABLE "PromotionShippingZone" (
    "revisionId" TEXT NOT NULL,
    "shippingZoneId" TEXT NOT NULL,

    CONSTRAINT "PromotionShippingZone_pkey" PRIMARY KEY ("revisionId","shippingZoneId")
);

-- CreateTable
CREATE TABLE "PromotionTargetSet" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "role" "PromotionTargetRole" NOT NULL,

    CONSTRAINT "PromotionTargetSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionTargetProduct" (
    "targetSetId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "PromotionTargetProduct_pkey" PRIMARY KEY ("targetSetId","productId")
);

-- CreateTable
CREATE TABLE "PromotionTargetVariant" (
    "targetSetId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "PromotionTargetVariant_pkey" PRIMARY KEY ("targetSetId","variantId")
);

-- CreateTable
CREATE TABLE "PromotionTargetCategory" (
    "targetSetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "PromotionTargetCategory_pkey" PRIMARY KEY ("targetSetId","categoryId")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "internalName" VARCHAR(200) NOT NULL,
    "benefitType" "PromotionBenefitType" NOT NULL,
    "activationMethod" "PromotionActivationMethod" NOT NULL,
    "firstPublishedAt" TIMESTAMPTZ(3),
    "disabledAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "normalizedCode" VARCHAR(16),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "maximumCodesPerCart" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRevision" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "campaignId" TEXT,
    "version" INTEGER NOT NULL,
    "status" "PromotionRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "authoredTimeZone" VARCHAR(100) NOT NULL,
    "publicTitle" VARCHAR(200),
    "globalRedemptionLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionCurrencyAmount" (
    "revisionId" TEXT NOT NULL,
    "purpose" "PromotionAmountPurpose" NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "PromotionCurrencyAmount_pkey" PRIMARY KEY ("revisionId","purpose","currencyCode")
);

-- CreateTable
CREATE TABLE "PromotionCombinationPolicy" (
    "revisionId" TEXT NOT NULL,
    "combinesWithProduct" BOOLEAN NOT NULL DEFAULT false,
    "combinesWithOrder" BOOLEAN NOT NULL DEFAULT false,
    "combinesWithShipping" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PromotionCombinationPolicy_pkey" PRIMARY KEY ("revisionId")
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignRevision_campaignId_status_publishedAt_version_idx" ON "CampaignRevision"("campaignId", "status", "publishedAt", "version");

-- CreateIndex
CREATE INDEX "CampaignRevision_status_startsAt_endsAt_idx" ON "CampaignRevision"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRevision_campaignId_version_key" ON "CampaignRevision"("campaignId", "version");

-- CreateIndex
CREATE INDEX "CampaignCurrencyBudget_currencyCode_idx" ON "CampaignCurrencyBudget"("currencyCode");

-- CreateIndex
CREATE INDEX "PromotionAuditEvent_promotionId_createdAt_idx" ON "PromotionAuditEvent"("promotionId", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionAuditEvent_revisionId_idx" ON "PromotionAuditEvent"("revisionId");

-- CreateIndex
CREATE INDEX "PromotionAuditEvent_actorUserId_createdAt_idx" ON "PromotionAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionAuditEvent_correlationId_idx" ON "PromotionAuditEvent"("correlationId");

-- CreateIndex
CREATE INDEX "CampaignAuditEvent_campaignId_createdAt_idx" ON "CampaignAuditEvent"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignAuditEvent_revisionId_idx" ON "CampaignAuditEvent"("revisionId");

-- CreateIndex
CREATE INDEX "CampaignAuditEvent_actorUserId_createdAt_idx" ON "CampaignAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignAuditEvent_correlationId_idx" ON "CampaignAuditEvent"("correlationId");

-- CreateIndex
CREATE INDEX "PromotionShippingZone_shippingZoneId_idx" ON "PromotionShippingZone"("shippingZoneId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionTargetSet_revisionId_role_key" ON "PromotionTargetSet"("revisionId", "role");

-- CreateIndex
CREATE INDEX "PromotionTargetProduct_productId_idx" ON "PromotionTargetProduct"("productId");

-- CreateIndex
CREATE INDEX "PromotionTargetVariant_variantId_idx" ON "PromotionTargetVariant"("variantId");

-- CreateIndex
CREATE INDEX "PromotionTargetCategory_categoryId_idx" ON "PromotionTargetCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_normalizedCode_key" ON "Promotion"("normalizedCode");

-- CreateIndex
CREATE INDEX "Promotion_activationMethod_archivedAt_disabledAt_idx" ON "Promotion"("activationMethod", "archivedAt", "disabledAt");

-- CreateIndex
CREATE INDEX "PromotionRevision_promotionId_status_publishedAt_version_idx" ON "PromotionRevision"("promotionId", "status", "publishedAt", "version");

-- CreateIndex
CREATE INDEX "PromotionRevision_status_startsAt_endsAt_idx" ON "PromotionRevision"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PromotionRevision_campaignId_idx" ON "PromotionRevision"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRevision_promotionId_version_key" ON "PromotionRevision"("promotionId", "version");

-- CreateIndex
CREATE INDEX "PromotionCurrencyAmount_currencyCode_idx" ON "PromotionCurrencyAmount"("currencyCode");

-- AddForeignKey
ALTER TABLE "CampaignRevision" ADD CONSTRAINT "CampaignRevision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCurrencyBudget" ADD CONSTRAINT "CampaignCurrencyBudget_campaignRevisionId_fkey" FOREIGN KEY ("campaignRevisionId") REFERENCES "CampaignRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCurrencyBudget" ADD CONSTRAINT "CampaignCurrencyBudget_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "CommerceCurrency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDiscountRule" ADD CONSTRAINT "ProductDiscountRule_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PromotionRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDiscountRule" ADD CONSTRAINT "OrderDiscountRule_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PromotionRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyXGetYRule" ADD CONSTRAINT "BuyXGetYRule_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PromotionRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeShippingRule" ADD CONSTRAINT "FreeShippingRule_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PromotionRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionShippingCountry" ADD CONSTRAINT "PromotionShippingCountry_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "FreeShippingRule"("revisionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionShippingZone" ADD CONSTRAINT "PromotionShippingZone_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "FreeShippingRule"("revisionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionShippingZone" ADD CONSTRAINT "PromotionShippingZone_shippingZoneId_fkey" FOREIGN KEY ("shippingZoneId") REFERENCES "ShippingZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTargetSet" ADD CONSTRAINT "PromotionTargetSet_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PromotionRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTargetProduct" ADD CONSTRAINT "PromotionTargetProduct_targetSetId_fkey" FOREIGN KEY ("targetSetId") REFERENCES "PromotionTargetSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTargetProduct" ADD CONSTRAINT "PromotionTargetProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTargetVariant" ADD CONSTRAINT "PromotionTargetVariant_targetSetId_fkey" FOREIGN KEY ("targetSetId") REFERENCES "PromotionTargetSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTargetVariant" ADD CONSTRAINT "PromotionTargetVariant_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTargetCategory" ADD CONSTRAINT "PromotionTargetCategory_targetSetId_fkey" FOREIGN KEY ("targetSetId") REFERENCES "PromotionTargetSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTargetCategory" ADD CONSTRAINT "PromotionTargetCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRevision" ADD CONSTRAINT "PromotionRevision_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRevision" ADD CONSTRAINT "PromotionRevision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCurrencyAmount" ADD CONSTRAINT "PromotionCurrencyAmount_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PromotionRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCurrencyAmount" ADD CONSTRAINT "PromotionCurrencyAmount_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "CommerceCurrency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCombinationPolicy" ADD CONSTRAINT "PromotionCombinationPolicy_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PromotionRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Constraints 
BEGIN;

ALTER TABLE "PromotionSettings"
  ADD CONSTRAINT "PromotionSettings_singleton_check" CHECK ("id" = 'default'),
  ADD CONSTRAINT "PromotionSettings_code_limit_check" CHECK ("maximumCodesPerCart" BETWEEN 1 AND 5);

ALTER TABLE "Promotion"
  ADD CONSTRAINT "Promotion_name_check" CHECK ("internalName" ~ '[^[:space:]]'),
  ADD CONSTRAINT "Promotion_activation_check" CHECK (
    ("activationMethod" = 'AUTOMATIC' AND "normalizedCode" IS NULL)
    OR ("activationMethod" = 'DISCOUNT_CODE' AND "normalizedCode" IS NOT NULL
      AND "normalizedCode" COLLATE "C" ~ '^[A-Z0-9_-]{6,16}$')
  );

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_name_check" CHECK ("internalName" ~ '[^[:space:]]');

ALTER TABLE "ShippingZone"
  ADD CONSTRAINT "ShippingZone_name_check" CHECK ("name" ~ '[^[:space:]]');

ALTER TABLE "PromotionRevision"
  ADD CONSTRAINT "PromotionRevision_shape_check" CHECK (
    "version" > 0 AND ("endsAt" IS NULL OR "startsAt" < "endsAt")
    AND "authoredTimeZone" ~ '[^[:space:]]'
    AND ("publicTitle" IS NULL OR "publicTitle" ~ '[^[:space:]]')
    AND ("globalRedemptionLimit" IS NULL OR "globalRedemptionLimit" > 0)
    AND ("perCustomerLimit" IS NULL OR "perCustomerLimit" > 0)
    AND (("status" = 'DRAFT' AND "publishedAt" IS NULL)
      OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL))
  );

ALTER TABLE "CampaignRevision"
  ADD CONSTRAINT "CampaignRevision_shape_check" CHECK (
    "version" > 0 AND ("endsAt" IS NULL OR "startsAt" < "endsAt")
    AND "authoredTimeZone" ~ '[^[:space:]]'
    AND ("redemptionLimit" IS NULL OR "redemptionLimit" > 0)
    AND (("status" = 'DRAFT' AND "publishedAt" IS NULL)
      OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL))
  );

ALTER TABLE "PromotionCurrencyAmount"
  ADD CONSTRAINT "PromotionCurrencyAmount_positive_check" CHECK ("amountMinor" > 0);

ALTER TABLE "CampaignCurrencyBudget"
  ADD CONSTRAINT "CampaignCurrencyBudget_positive_check" CHECK ("spendLimitMinor" > 0);

ALTER TABLE "ProductDiscountRule"
  ADD CONSTRAINT "ProductDiscountRule_shape_check" CHECK (
    (("calculationMethod" = 'PERCENTAGE' AND "percentageBasisPoints" IS NOT NULL
        AND "percentageBasisPoints" BETWEEN 1 AND 10000 AND "fixedApplicationMode" IS NULL)
      OR ("calculationMethod" = 'FIXED_AMOUNT' AND "percentageBasisPoints" IS NULL
        AND "fixedApplicationMode" IS NOT NULL))
    AND (("minimumMode" = 'ELIGIBLE_UNIT_QUANTITY' AND "minimumQuantity" IS NOT NULL AND "minimumQuantity" > 0)
      OR ("minimumMode" <> 'ELIGIBLE_UNIT_QUANTITY' AND "minimumQuantity" IS NULL))
  );

ALTER TABLE "OrderDiscountRule"
  ADD CONSTRAINT "OrderDiscountRule_shape_check" CHECK (
    (("calculationMethod" = 'PERCENTAGE' AND "percentageBasisPoints" IS NOT NULL
        AND "percentageBasisPoints" BETWEEN 1 AND 10000)
      OR ("calculationMethod" = 'FIXED_AMOUNT' AND "percentageBasisPoints" IS NULL))
    AND (("minimumMode" = 'MERCHANDISE_UNIT_QUANTITY' AND "minimumQuantity" IS NOT NULL AND "minimumQuantity" > 0)
      OR ("minimumMode" <> 'MERCHANDISE_UNIT_QUANTITY' AND "minimumQuantity" IS NULL))
  );

ALTER TABLE "BuyXGetYRule"
  ADD CONSTRAINT "BuyXGetYRule_shape_check" CHECK (
    "rewardQuantity" > 0
    AND (("requirementMode" = 'ELIGIBLE_QUANTITY' AND "qualifyingQuantity" IS NOT NULL AND "qualifyingQuantity" > 0)
      OR ("requirementMode" <> 'ELIGIBLE_QUANTITY' AND "qualifyingQuantity" IS NULL))
    AND (("rewardMethod" = 'PERCENTAGE' AND "rewardPercentageBasisPoints" IS NOT NULL
        AND "rewardPercentageBasisPoints" BETWEEN 1 AND 10000)
      OR ("rewardMethod" <> 'PERCENTAGE' AND "rewardPercentageBasisPoints" IS NULL))
    AND (("frequency" = 'ONCE_PER_ORDER' AND "maximumUsesPerOrder" IS NULL)
      OR ("frequency" = 'REPEAT_FOR_EVERY_REQUIREMENT'
        AND ("maximumUsesPerOrder" IS NULL OR "maximumUsesPerOrder" > 0)))
  );

ALTER TABLE "FreeShippingRule"
  ADD CONSTRAINT "FreeShippingRule_shape_check" CHECK (
    ("minimumMode" = 'MERCHANDISE_UNIT_QUANTITY' AND "minimumQuantity" IS NOT NULL AND "minimumQuantity" > 0)
    OR ("minimumMode" <> 'MERCHANDISE_UNIT_QUANTITY' AND "minimumQuantity" IS NULL)
  );

ALTER TABLE "PromotionShippingCountry"
  ADD CONSTRAINT "PromotionShippingCountry_code_check" CHECK ("countryCode" COLLATE "C" ~ '^[A-Z]{2}$');

ALTER TABLE "PromotionAuditEvent"
  ADD CONSTRAINT "PromotionAuditEvent_strings_check" CHECK (
    "actorUserId" ~ '[^[:space:]]' AND "action" ~ '[^[:space:]]' AND "correlationId" ~ '[^[:space:]]'
    AND ("promotionId" IS NULL OR "promotionId" ~ '[^[:space:]]')
    AND ("revisionId" IS NULL OR "revisionId" ~ '[^[:space:]]')
    AND ("reason" IS NULL OR "reason" ~ '[^[:space:]]')
  );

ALTER TABLE "CampaignAuditEvent"
  ADD CONSTRAINT "CampaignAuditEvent_strings_check" CHECK (
    "campaignId" ~ '[^[:space:]]' AND "actorUserId" ~ '[^[:space:]]'
    AND "action" ~ '[^[:space:]]' AND "correlationId" ~ '[^[:space:]]'
    AND ("revisionId" IS NULL OR "revisionId" ~ '[^[:space:]]')
    AND ("reason" IS NULL OR "reason" ~ '[^[:space:]]')
  );

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'btree_gist' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'Provision btree_gist in public before replaying this migration';
  END IF;
  PERFORM set_config('search_path', format('%I, public, pg_catalog, pg_temp', current_schema()), true);
END;
$migration$;

CREATE UNIQUE INDEX "PromotionRevision_one_draft_idx" ON "PromotionRevision" ("promotionId")
  WHERE "status" = 'DRAFT';

CREATE UNIQUE INDEX "CampaignRevision_one_draft_idx" ON "CampaignRevision" ("campaignId")
  WHERE "status" = 'DRAFT';

ALTER TABLE "PromotionRevision" ADD CONSTRAINT "PromotionRevision_no_overlap"
  EXCLUDE USING gist ("promotionId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" = 'PUBLISHED') DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "CampaignRevision" ADD CONSTRAINT "CampaignRevision_no_overlap"
  EXCLUDE USING gist ("campaignId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" = 'PUBLISHED') DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION promotion_assert_revision(revision_id text) RETURNS void

LANGUAGE plpgsql 
SET search_path FROM CURRENT 
AS $function$

DECLARE
  r "PromotionRevision"%ROWTYPE;
  p "Promotion"%ROWTYPE;
  pr "ProductDiscountRule"%ROWTYPE;
  od "OrderDiscountRule"%ROWTYPE;
  bo "BuyXGetYRule"%ROWTYPE;
  fs "FreeShippingRule"%ROWTYPE;
  rule_count integer;
  set_count integer;
  country_count integer;
  zone_count integer;
  needs_fixed boolean := false;
  needs_minimum boolean := false;
  allows_maximum boolean := false;
  allows_ceiling boolean := false;

BEGIN
  SELECT * INTO r FROM "PromotionRevision" WHERE "id" = revision_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO STRICT p FROM "Promotion" WHERE "id" = r."promotionId";
  SELECT * INTO pr FROM "ProductDiscountRule" WHERE "revisionId" = revision_id;
  SELECT * INTO od FROM "OrderDiscountRule" WHERE "revisionId" = revision_id;
  SELECT * INTO bo FROM "BuyXGetYRule" WHERE "revisionId" = revision_id;
  SELECT * INTO fs FROM "FreeShippingRule" WHERE "revisionId" = revision_id;

  rule_count := (pr."revisionId" IS NOT NULL)::integer + (od."revisionId" IS NOT NULL)::integer
    + (bo."revisionId" IS NOT NULL)::integer + (fs."revisionId" IS NOT NULL)::integer;

  IF rule_count <> 1 OR NOT (
    (p."benefitType" = 'PRODUCT_DISCOUNT' AND pr."revisionId" IS NOT NULL)
    OR (p."benefitType" = 'ORDER_DISCOUNT' AND od."revisionId" IS NOT NULL)
    OR (p."benefitType" = 'BUY_X_GET_Y' AND bo."revisionId" IS NOT NULL)
    OR (p."benefitType" = 'FREE_SHIPPING' AND fs."revisionId" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Revision needs exactly one matching benefit rule' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "PromotionCombinationPolicy" WHERE "revisionId" = revision_id) THEN
    RAISE EXCEPTION 'Revision needs a combination policy' USING ERRCODE = '23514';
  END IF;

  IF (p."activationMethod" = 'AUTOMATIC' AND
      (r."publicTitle" IS NULL OR r."globalRedemptionLimit" IS NOT NULL OR r."perCustomerLimit" IS NOT NULL))
    OR (p."activationMethod" = 'DISCOUNT_CODE' AND r."publicTitle" IS NOT NULL) THEN
    RAISE EXCEPTION 'Revision label or limits disagree with activation method' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO set_count FROM "PromotionTargetSet" WHERE "revisionId" = revision_id;

  IF pr."revisionId" IS NOT NULL THEN
    IF (pr."targetMode" = 'ALL_PRODUCTS' AND set_count <> 0)
      OR (pr."targetMode" = 'SPECIFIC_MERCHANDISE' AND (set_count <> 1 OR NOT EXISTS (
        SELECT 1 FROM "PromotionTargetSet" WHERE "revisionId" = revision_id AND "role" = 'PRODUCT_DISCOUNT'
      ))) THEN
      RAISE EXCEPTION 'Product target sets disagree with target mode' USING ERRCODE = '23514';
    END IF;

    needs_fixed := pr."calculationMethod" = 'FIXED_AMOUNT';
    needs_minimum := pr."minimumMode" = 'ELIGIBLE_MERCHANDISE_AMOUNT';
    allows_maximum := pr."calculationMethod" = 'PERCENTAGE' OR pr."fixedApplicationMode" = 'PER_ELIGIBLE_UNIT';

  ELSIF bo."revisionId" IS NOT NULL THEN
    IF set_count <> 2 OR NOT EXISTS (
      SELECT 1 FROM "PromotionTargetSet" WHERE "revisionId" = revision_id AND "role" = 'BOGO_BUYS'
    ) OR NOT EXISTS (
      SELECT 1 FROM "PromotionTargetSet" WHERE "revisionId" = revision_id AND "role" = 'BOGO_GETS'
    ) THEN
      RAISE EXCEPTION 'BOGO needs buys and gets target sets' USING ERRCODE = '23514';
    END IF;
    needs_fixed := bo."rewardMethod" = 'FIXED_AMOUNT';
    needs_minimum := bo."requirementMode" = 'ELIGIBLE_MERCHANDISE_AMOUNT';

  ELSE
    IF set_count <> 0 THEN
      RAISE EXCEPTION 'Order and shipping rules cannot own merchandise targets' USING ERRCODE = '23514';
    END IF;
    IF od."revisionId" IS NOT NULL THEN
      needs_fixed := od."calculationMethod" = 'FIXED_AMOUNT';
      needs_minimum := od."minimumMode" = 'MERCHANDISE_SUBTOTAL';
      allows_maximum := od."calculationMethod" = 'PERCENTAGE';
    ELSE
      needs_minimum := fs."minimumMode" = 'MERCHANDISE_SUBTOTAL';
      allows_ceiling := true;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "PromotionTargetSet" s WHERE s."revisionId" = revision_id
      AND NOT EXISTS (SELECT 1 FROM "PromotionTargetProduct" t WHERE t."targetSetId" = s."id")
      AND NOT EXISTS (SELECT 1 FROM "PromotionTargetVariant" t WHERE t."targetSetId" = s."id")
      AND NOT EXISTS (SELECT 1 FROM "PromotionTargetCategory" t WHERE t."targetSetId" = s."id")
  ) THEN
    RAISE EXCEPTION 'Specific merchandise selections cannot be empty' USING ERRCODE = '23514';
  END IF;

  IF fs."revisionId" IS NOT NULL THEN
    SELECT count(*) INTO country_count FROM "PromotionShippingCountry" WHERE "revisionId" = revision_id;
    SELECT count(*) INTO zone_count FROM "PromotionShippingZone" WHERE "revisionId" = revision_id;
    IF (fs."destinationMode" = 'ALL_SERVICEABLE_COUNTRIES' AND (country_count <> 0 OR zone_count <> 0))
      OR (fs."destinationMode" = 'SELECTED_COUNTRIES' AND (country_count = 0 OR zone_count <> 0))
      OR (fs."destinationMode" = 'SHIPPING_ZONES' AND (zone_count = 0 OR country_count <> 0))
      OR EXISTS (SELECT 1 FROM "PromotionCombinationPolicy"
        WHERE "revisionId" = revision_id AND "combinesWithShipping") THEN
      RAISE EXCEPTION 'Shipping destinations or combination policy are invalid' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "PromotionCurrencyAmount" a WHERE a."revisionId" = revision_id AND (
      (a."purpose" = 'BENEFIT_FIXED' AND NOT needs_fixed)
      OR (a."purpose" = 'MINIMUM_PURCHASE' AND NOT needs_minimum)
      OR (a."purpose" = 'MAXIMUM_DISCOUNT' AND NOT coalesce(allows_maximum, false))
      OR (a."purpose" = 'SHIPPING_RATE_CEILING' AND NOT allows_ceiling)
    )
  ) OR (needs_fixed AND NOT EXISTS (SELECT 1 FROM "PromotionCurrencyAmount"
    WHERE "revisionId" = revision_id AND "purpose" = 'BENEFIT_FIXED'))
    OR (needs_minimum AND NOT EXISTS (SELECT 1 FROM "PromotionCurrencyAmount"
      WHERE "revisionId" = revision_id AND "purpose" = 'MINIMUM_PURCHASE')) THEN
    RAISE EXCEPTION 'Currency purposes disagree with the benefit rule' USING ERRCODE = '23514';
  END IF;
END;
$function$;

CREATE FUNCTION promotion_guard_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT 
AS $function$
DECLARE
  has_history boolean;

BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'Promotion' THEN
    SELECT EXISTS (SELECT 1 FROM "PromotionRevision"
      WHERE "promotionId" = OLD."id" AND "status" = 'PUBLISHED') INTO has_history;
  ELSE
    SELECT EXISTS (SELECT 1 FROM "CampaignRevision"
      WHERE "campaignId" = OLD."id" AND "status" = 'PUBLISHED') INTO has_history;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."firstPublishedAt" IS NOT NULL OR has_history THEN
      RAISE EXCEPTION 'Published identities cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION 'Stable identity IDs cannot change' USING ERRCODE = '23514';
  END IF;

  IF OLD."firstPublishedAt" IS NOT NULL AND NEW."firstPublishedAt" IS DISTINCT FROM OLD."firstPublishedAt" THEN
    RAISE EXCEPTION 'First publication cannot be changed or cleared' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'Promotion' AND (OLD."firstPublishedAt" IS NOT NULL OR has_history) THEN
    IF (to_jsonb(NEW) -> 'benefitType') IS DISTINCT FROM (to_jsonb(OLD) -> 'benefitType')
      OR (to_jsonb(NEW) -> 'activationMethod') IS DISTINCT FROM (to_jsonb(OLD) -> 'activationMethod')
      OR (to_jsonb(NEW) -> 'normalizedCode') IS DISTINCT FROM (to_jsonb(OLD) -> 'normalizedCode') THEN
      RAISE EXCEPTION 'Published benefit, activation method, and code are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER promotion_identity_guard BEFORE INSERT OR UPDATE OR DELETE ON "Promotion"
  FOR EACH ROW EXECUTE FUNCTION promotion_guard_identity();

CREATE TRIGGER campaign_identity_guard BEFORE INSERT OR UPDATE OR DELETE ON "Campaign"
  FOR EACH ROW EXECUTE FUNCTION promotion_guard_identity();

CREATE FUNCTION promotion_guard_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT 
AS $function$
DECLARE
  parent_id text;
  latest_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."id" <> OLD."id" OR
    (to_jsonb(NEW) -> coalesce(TG_ARGV[0], 'promotionId')) IS DISTINCT FROM
    (to_jsonb(OLD) -> coalesce(TG_ARGV[0], 'promotionId'))) THEN
    RAISE EXCEPTION 'Revision identity and owner cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN parent_id := to_jsonb(OLD) ->> TG_ARGV[0];
  ELSE parent_id := to_jsonb(NEW) ->> TG_ARGV[0]; END IF;
  EXECUTE format('SELECT "id" FROM %I WHERE "id" = $1 FOR UPDATE', TG_ARGV[1]) USING parent_id;
  IF TG_OP <> 'INSERT' AND OLD."status" = 'PUBLISHED' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Published revisions cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - 'endsAt') IS DISTINCT FROM (to_jsonb(OLD) - 'endsAt')
      OR NEW."endsAt" IS NULL OR NEW."endsAt" <= OLD."startsAt"
      OR (OLD."endsAt" IS NOT NULL AND NEW."endsAt" >= OLD."endsAt") THEN
      RAISE EXCEPTION 'Only a strictly shorter published end is allowed' USING ERRCODE = '23514';
    END IF;
    EXECUTE format('SELECT "id" FROM %I WHERE %I = $1 AND "status" = ''PUBLISHED''
      ORDER BY "publishedAt" DESC, "version" DESC LIMIT 1', TG_TABLE_NAME, TG_ARGV[0])
      INTO latest_id USING parent_id;
    IF latest_id IS DISTINCT FROM OLD."id" THEN
      RAISE EXCEPTION 'Only the latest published window may close' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER promotion_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON "PromotionRevision"
  FOR EACH ROW EXECUTE FUNCTION promotion_guard_revision('promotionId', 'Promotion');
CREATE TRIGGER campaign_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON "CampaignRevision"
  FOR EACH ROW EXECUTE FUNCTION promotion_guard_revision('campaignId', 'Campaign');

CREATE FUNCTION promotion_guard_child() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $function$
DECLARE
  old_revision text;
  new_revision text;
  revision_id text;
  parent_id text;
  revision_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_revision := to_jsonb(OLD) ->> TG_ARGV[0];
    IF TG_ARGV[0] = 'targetSetId' THEN
      SELECT "revisionId" INTO old_revision FROM "PromotionTargetSet" WHERE "id" = old_revision;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_revision := to_jsonb(NEW) ->> TG_ARGV[0];
    IF TG_ARGV[0] = 'targetSetId' THEN
      SELECT "revisionId" INTO new_revision FROM "PromotionTargetSet" WHERE "id" = new_revision;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'PromotionTargetSet' AND TG_OP = 'UPDATE'
    AND (to_jsonb(NEW) -> 'id') IS DISTINCT FROM (to_jsonb(OLD) -> 'id') THEN
    RAISE EXCEPTION 'Target set IDs cannot change' USING ERRCODE = '23514';
  END IF;
  -- Lock both stable parents in ID order before checking either revision.
  FOR parent_id IN EXECUTE format(
    'SELECT DISTINCT %I FROM %I WHERE "id" = ANY($1) ORDER BY 1', TG_ARGV[2], TG_ARGV[1])
    USING ARRAY[old_revision, new_revision]
  LOOP
    EXECUTE format('SELECT "id" FROM %I WHERE "id" = $1 FOR UPDATE', TG_ARGV[3]) USING parent_id;
  END LOOP;
  FOR revision_id IN SELECT DISTINCT v FROM unnest(ARRAY[old_revision, new_revision]) AS ids(v)
    WHERE v IS NOT NULL ORDER BY v
  LOOP
    EXECUTE format('SELECT "status"::text FROM %I WHERE "id" = $1', TG_ARGV[1])
      INTO revision_status USING revision_id;
    IF revision_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'Published child records cannot be inserted, moved, changed, or deleted'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DO $migration$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ProductDiscountRule', 'OrderDiscountRule', 'BuyXGetYRule', 'FreeShippingRule',
    'PromotionCombinationPolicy', 'PromotionCurrencyAmount', 'PromotionTargetSet',
    'PromotionShippingCountry', 'PromotionShippingZone'
  ] LOOP
    EXECUTE format('CREATE TRIGGER published_child_guard BEFORE INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION promotion_guard_child(%L, %L, %L, %L)',
      table_name, 'revisionId', 'PromotionRevision', 'promotionId', 'Promotion');
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['PromotionTargetProduct', 'PromotionTargetVariant', 'PromotionTargetCategory'] LOOP
    EXECUTE format('CREATE TRIGGER published_child_guard BEFORE INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION promotion_guard_child(%L, %L, %L, %L)',
      table_name, 'targetSetId', 'PromotionRevision', 'promotionId', 'Promotion');
  END LOOP;
END;
$migration$;
CREATE TRIGGER published_child_guard BEFORE INSERT OR UPDATE OR DELETE ON "CampaignCurrencyBudget"
  FOR EACH ROW EXECUTE FUNCTION promotion_guard_child('campaignRevisionId', 'CampaignRevision', 'campaignId', 'Campaign');

CREATE FUNCTION promotion_reject_audit_change() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $function$
BEGIN
  RAISE EXCEPTION 'Audit evidence is append-only' USING ERRCODE = '23514';
END;
$function$;
CREATE TRIGGER promotion_audit_append_only BEFORE UPDATE OR DELETE ON "PromotionAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION promotion_reject_audit_change();
CREATE TRIGGER campaign_audit_append_only BEFORE UPDATE OR DELETE ON "CampaignAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION promotion_reject_audit_change();

CREATE FUNCTION promotion_check_window_closure() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $function$
DECLARE
  parent_id text;
  successor_id text;
  final_row jsonb;
  audit_exists boolean;
  transaction_id bigint := mod(txid_current(), 4294967296);
BEGIN
  IF OLD."status" <> 'PUBLISHED' THEN RETURN NULL; END IF;
  parent_id := to_jsonb(OLD) ->> TG_ARGV[0];
  EXECUTE format('SELECT to_jsonb(r) FROM %I r WHERE "id" = $1', TG_TABLE_NAME)
    INTO final_row USING OLD."id";
  IF final_row IS DISTINCT FROM to_jsonb(NEW) THEN
    RAISE EXCEPTION 'A published window may close only once per transaction' USING ERRCODE = '23514';
  END IF;
  EXECUTE format('SELECT "id" FROM %I WHERE %I = $1 AND "status" = ''PUBLISHED''
    AND "id" <> $2 AND "startsAt" = $3 AND xmin::text::bigint = $4
    AND ("publishedAt", "version") > ($5, $6)
    ORDER BY "publishedAt" DESC, "version" DESC LIMIT 1', TG_TABLE_NAME, TG_ARGV[0])
    INTO successor_id USING parent_id, OLD."id", NEW."endsAt", transaction_id, OLD."publishedAt", OLD."version";
  IF successor_id IS NULL THEN
    RAISE EXCEPTION 'Window closure needs a replacement published in this transaction' USING ERRCODE = '23514';
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1 AND "revisionId" = $2
    AND "action" = ''revision.window_closed'' AND xmin::text::bigint = $3
    AND "changeSummary" @> $4)', TG_ARGV[1], TG_ARGV[0])
    INTO audit_exists USING parent_id, OLD."id", transaction_id,
      jsonb_build_object('replacementRevisionId', successor_id,
        'previousEndsAt', OLD."endsAt", 'endsAt', NEW."endsAt");
  IF NOT audit_exists THEN
    RAISE EXCEPTION 'Window closure needs matching audit evidence in this transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$function$;
CREATE CONSTRAINT TRIGGER promotion_window_closure AFTER UPDATE ON "PromotionRevision"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION promotion_check_window_closure('promotionId', 'PromotionAuditEvent');
CREATE CONSTRAINT TRIGGER campaign_window_closure AFTER UPDATE ON "CampaignRevision"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION promotion_check_window_closure('campaignId', 'CampaignAuditEvent');


CREATE FUNCTION promotion_assert_parent(parent_id text, is_campaign boolean) RETURNS void
LANGUAGE plpgsql SET search_path FROM CURRENT AS $function$
DECLARE
  first_publication timestamptz;
  actual_first timestamptz;
  revision_id text;
BEGIN
  IF is_campaign THEN
    SELECT "firstPublishedAt" INTO first_publication FROM "Campaign" WHERE "id" = parent_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT min("publishedAt") INTO actual_first FROM "CampaignRevision"
      WHERE "campaignId" = parent_id AND "status" = 'PUBLISHED';
  ELSE
    SELECT "firstPublishedAt" INTO first_publication FROM "Promotion" WHERE "id" = parent_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT min("publishedAt") INTO actual_first FROM "PromotionRevision"
      WHERE "promotionId" = parent_id AND "status" = 'PUBLISHED';
    FOR revision_id IN SELECT "id" FROM "PromotionRevision" WHERE "promotionId" = parent_id LOOP
      PERFORM promotion_assert_revision(revision_id);
    END LOOP;
  END IF;
  IF first_publication IS DISTINCT FROM actual_first THEN
    RAISE EXCEPTION 'First publication must match permanent published history' USING ERRCODE = '23514';
  END IF;
END;
$function$;

CREATE FUNCTION promotion_check_aggregate() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $function$
DECLARE
  previous_row jsonb;
  next_row jsonb;
  row_data jsonb;
  revision_id text;
  parent_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN next_row := to_jsonb(NEW); END IF;
  FOR row_data IN SELECT v FROM (VALUES (previous_row), (next_row)) AS affected(v) WHERE v IS NOT NULL LOOP
    IF TG_TABLE_NAME IN ('Promotion', 'Campaign') THEN
      PERFORM promotion_assert_parent(row_data ->> 'id', TG_TABLE_NAME = 'Campaign');
    ELSIF TG_TABLE_NAME = 'CampaignRevision' THEN
      PERFORM promotion_assert_parent(row_data ->> 'campaignId', true);
    ELSE
      IF TG_TABLE_NAME = 'PromotionRevision' THEN
        revision_id := row_data ->> 'id';
        PERFORM promotion_assert_parent(row_data ->> 'promotionId', false);
      ELSIF TG_TABLE_NAME IN ('PromotionTargetProduct', 'PromotionTargetVariant', 'PromotionTargetCategory') THEN
        SELECT "revisionId" INTO revision_id FROM "PromotionTargetSet" WHERE "id" = row_data ->> 'targetSetId';
      ELSE
        revision_id := row_data ->> 'revisionId';
      END IF;
      PERFORM promotion_assert_revision(revision_id);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

DO $migration$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Promotion', 'Campaign', 'PromotionRevision', 'CampaignRevision',
    'ProductDiscountRule', 'OrderDiscountRule', 'BuyXGetYRule', 'FreeShippingRule',
    'PromotionCombinationPolicy', 'PromotionCurrencyAmount', 'PromotionTargetSet',
    'PromotionTargetProduct', 'PromotionTargetVariant', 'PromotionTargetCategory',
    'PromotionShippingCountry', 'PromotionShippingZone'
  ] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER aggregate_guard AFTER INSERT OR UPDATE OR DELETE ON %I
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION promotion_check_aggregate()', table_name);
  END LOOP;
END;
$migration$;

COMMIT;