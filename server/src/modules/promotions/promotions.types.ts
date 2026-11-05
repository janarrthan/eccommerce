import type {
  AMOUNT_PURPOSES,
  APPLICATION_FREQUENCIES,
  BUY_REQUIREMENT_MODES,
  DESTINATION_MODES,
  FIXED_APPLICATION_MODES,
  ORDER_MINIMUM_MODES,
  PRODUCT_MINIMUM_MODES,
  PROMOTION_ACTIVATION_METHODS,
  PROMOTION_BENEFIT_CLASSES,
  PROMOTION_BENEFIT_TYPES,
  PROMOTION_CALCULATION_METHODS,
  PROMOTION_REVISION_STATUSES,
  PROMOTION_STATUSES,
  PROMOTION_TARGET_MODES,
  REWARD_METHODS,
  SHIPPING_MINIMUM_MODES,
  TARGET_ROLES,
} from "./promotions.constants.js";

type ValueOf<T> = T[keyof T];

export type PromotionBenefitType = ValueOf<typeof PROMOTION_BENEFIT_TYPES>;
export type PromotionActivationMethod = ValueOf<typeof PROMOTION_ACTIVATION_METHODS>;
export type PromotionRevisionStatus = ValueOf<typeof PROMOTION_REVISION_STATUSES>;
export type PromotionStatus = ValueOf<typeof PROMOTION_STATUSES>;
export type PromotionCalculationMethod = ValueOf<typeof PROMOTION_CALCULATION_METHODS>;
export type FixedApplicationMode = ValueOf<typeof FIXED_APPLICATION_MODES>;
export type PromotionTargetMode = ValueOf<typeof PROMOTION_TARGET_MODES>;
export type ProductMinimumMode = ValueOf<typeof PRODUCT_MINIMUM_MODES>;
export type OrderMinimumMode = ValueOf<typeof ORDER_MINIMUM_MODES>;
export type BuyRequirementMode = ValueOf<typeof BUY_REQUIREMENT_MODES>;
export type RewardMethod = ValueOf<typeof REWARD_METHODS>;
export type ApplicationFrequency = ValueOf<typeof APPLICATION_FREQUENCIES>;
export type DestinationMode = ValueOf<typeof DESTINATION_MODES>;
export type ShippingMinimumMode = ValueOf<typeof SHIPPING_MINIMUM_MODES>;
export type AmountPurpose = ValueOf<typeof AMOUNT_PURPOSES>;
export type TargetRole = ValueOf<typeof TARGET_ROLES>;
export type PromotionBenefitClass = ValueOf<typeof PROMOTION_BENEFIT_CLASSES>;

/** Stores one currency-specific value, such as a LKR 2,000 minimum purchase, for one revision. */
export type PromotionCurrencyAmount = Readonly<{
  purpose: AmountPurpose;
  currencyCode: string;
  amountMinor: number;
}>;

/** Identifies merchandise through a union, such as one shoe product plus the complete footwear category. */
export type PromotionTargetSet = Readonly<{
  role: TargetRole;
  productIds: readonly string[];
  variantIds: readonly string[];
  categoryIds: readonly string[];
}>;

/** Records which benefit classes can combine, such as a product discount that permits an order discount. */
export type PromotionCombinationPolicy = Readonly<{
  combinesWithProduct: boolean;
  combinesWithOrder: boolean;
  combinesWithShipping: boolean;
}>;

type ProductDiscountRuleBase = Readonly<{
  benefitType: "PRODUCT_DISCOUNT";
  targetMode: PromotionTargetMode;
  minimumMode: ProductMinimumMode;
  minimumQuantity: number | null;
}>;

/** Describes a product percentage or fixed discount without allowing fields from the other calculation method. */
export type ProductDiscountRule = ProductDiscountRuleBase &
  Readonly<
    | {
        calculationMethod: "PERCENTAGE";
        percentageBasisPoints: number;
        fixedApplicationMode: null;
      }
    | {
        calculationMethod: "FIXED_AMOUNT";
        percentageBasisPoints: null;
        fixedApplicationMode: FixedApplicationMode;
      }
  >;

type OrderDiscountRuleBase = Readonly<{
  benefitType: "ORDER_DISCOUNT";
  minimumMode: OrderMinimumMode;
  minimumQuantity: number | null;
}>;

/** Describes an order percentage or fixed discount, such as 10% off the post-product-discount subtotal. */
export type OrderDiscountRule = OrderDiscountRuleBase &
  Readonly<
    | { calculationMethod: "PERCENTAGE"; percentageBasisPoints: number }
    | { calculationMethod: "FIXED_AMOUNT"; percentageBasisPoints: null }
  >;

type BuyXGetYRuleBase = Readonly<{
  benefitType: "BUY_X_GET_Y";
  requirementMode: BuyRequirementMode;
  qualifyingQuantity: number | null;
  rewardQuantity: number;
}>;

type BuyXGetYReward = Readonly<
  | { rewardMethod: "PERCENTAGE"; rewardPercentageBasisPoints: number }
  | { rewardMethod: "FIXED_AMOUNT" | "FREE"; rewardPercentageBasisPoints: null }
>;

type BuyXGetYFrequency = Readonly<
  | { frequency: "ONCE_PER_ORDER"; maximumUsesPerOrder: null }
  | { frequency: "REPEAT_FOR_EVERY_REQUIREMENT"; maximumUsesPerOrder: number | null }
>;

/** Describes the qualifying units, reward, and repeat behavior for an offer such as buy two shoes and get one free. */
export type BuyXGetYRule = BuyXGetYRuleBase & BuyXGetYReward & BuyXGetYFrequency;

/** Describes where free shipping is valid and which merchandise minimum must be met. */
export type FreeShippingRule = Readonly<{
  benefitType: "FREE_SHIPPING";
  destinationMode: DestinationMode;
  minimumMode: ShippingMinimumMode;
  minimumQuantity: number | null;
}>;

/** Narrows one revision to exactly one of the four supported benefit rules. */
export type PromotionRule = ProductDiscountRule | OrderDiscountRule | BuyXGetYRule | FreeShippingRule;

/**
 * Represents one cart line as seen by the pure promotion calculator.
 *
 * `reservedQuantity` prevents a unit already used by a Buy X Get Y calculation from receiving another product-level
 * benefit. For example, Buy 2 Get 1 Free reserves three shoes: two X units and one Y unit. A line with four shoes then
 * exposes only its fourth unit to later stages.
 */
export type PromotionCartLine = Readonly<{
  lineId: string;
  productId: string;
  variantId: string;
  categoryIds: readonly string[];
  quantity: number;
  reservedQuantity: number;
  unitAmountMinor: number;
}>;

/**
 * Contains one complete draft or published revision without a Prisma dependency.
 *
 * Plain values such as `campaignId` keep the calculation contract independent of database access.
 * This prevents generated Prisma types from becoming the promotion engine's public language.
 */
export type PromotionRevisionContract = Readonly<{
  id: string;
  promotionId: string;
  campaignId: string | null;
  version: number;
  status: PromotionRevisionStatus;
  publicTitle: string | null;
  startsAt: Date;
  endsAt: Date | null;
  authoredTimeZone: string;
  globalRedemptionLimit: number | null;
  perCustomerLimit: number | null;
  publishedAt: Date | null;
  rule: PromotionRule;
  currencyAmounts: readonly PromotionCurrencyAmount[];
  targetSets: readonly PromotionTargetSet[];
  combinationPolicy: PromotionCombinationPolicy;
}>;

/** Contains the optional campaign schedule and budgets evaluated at the same authoritative time as a promotion. */
export type CampaignRevisionContract = Readonly<{
  id: string;
  campaignId: string;
  version: number;
  status: PromotionRevisionStatus;
  startsAt: Date;
  endsAt: Date | null;
  redemptionLimit: number | null;
  currencyBudgets: readonly Readonly<{ currencyCode: string; spendLimitMinor: number }>[];
}>;

type PromotionCandidateBase = Readonly<{
  id: string;
  internalName: string;
  benefitType: PromotionBenefitType;
  disabledAt: Date | null;
  archivedAt: Date | null;
  revision: PromotionRevisionContract;
  campaignRevision: CampaignRevisionContract | null;
}>;

/**
 * Represents a promotion ready for cart-specific evaluation after candidate discovery.
 *
 * The activation union prevents an automatic promotion from accidentally carrying a code and requires a normalized code
 * such as `SHOES20` for every discount-code candidate.
 */
export type PromotionCandidate = PromotionCandidateBase &
  Readonly<{ activationMethod: "AUTOMATIC"; code: null } | { activationMethod: "DISCOUNT_CODE"; code: string }>;

/** Records requested and applied money to explain capping and the amount assigned to each cart line. */
export type PromotionAdjustment = Readonly<{
  promotionId: string;
  revisionId: string;
  benefitType: PromotionBenefitType;
  benefitClass: PromotionBenefitClass;
  requestedAmountMinor: number;
  appliedAmountMinor: number;
  lineAllocations: readonly Readonly<{ lineId: string; amountMinor: number }>[];
}>;
