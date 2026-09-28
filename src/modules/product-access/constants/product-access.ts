/**
 * Domain vocabulary of the academy product access: products, grant sources,
 * tribe access models, and the member-facing access status contract.
 *
 * @module product-access-constants
 */

/** Commercial product a grant or a subscription belongs to. */
export type ProductKey = "academy" | "membership";

export const PRODUCT_KEY = {
  academy: "academy",
  membership: "membership",
} as const satisfies Record<string, ProductKey>;

/** Business origin of an access grant. */
export type AccessGrantSourceType = "legacy" | "manual_bonus" | "subscription_payment";

export const ACCESS_GRANT_SOURCE_TYPE = {
  legacy: "legacy",
  manualBonus: "manual_bonus",
  subscriptionPayment: "subscription_payment",
} as const satisfies Record<string, AccessGrantSourceType>;

/** How a tribe authorizes its private content. */
export type TribeAccessModel = "academy" | "legacy";

export const TRIBE_ACCESS_MODEL = {
  academy: "academy",
  legacy: "legacy",
} as const satisfies Record<string, TribeAccessModel>;

/** Access level shown to the member. */
export type AcademyAccessLevel = "academy" | "basic";

export const ACADEMY_ACCESS_LEVEL = {
  academy: "academy",
  basic: "basic",
} as const satisfies Record<string, AcademyAccessLevel>;

/** Eligibility derived from the member verifications. */
export type AcademyEligibility = "not_requested" | "not_verified" | "pending" | "verified";

export const ACADEMY_ELIGIBILITY = {
  notRequested: "not_requested",
  notVerified: "not_verified",
  pending: "pending",
  verified: "verified",
} as const satisfies Record<string, AcademyEligibility>;

/** Renewal state of the academy subscription, as confirmed locally. */
export type AcademyRenewalStatus = "active" | "canceled" | "canceling" | "none" | "pending";

export const ACADEMY_RENEWAL_STATUS = {
  active: "active",
  canceled: "canceled",
  canceling: "canceling",
  none: "none",
  pending: "pending",
} as const satisfies Record<string, AcademyRenewalStatus>;

/** Next step suggested to the member on the academy page. */
export type AcademyNextAction =
  | "complete_checkout"
  | "contact_support"
  | "continue_learning"
  | "request_verification"
  | "view_offer"
  | "wait_for_verification";

export const ACADEMY_NEXT_ACTION = {
  completeCheckout: "complete_checkout",
  contactSupport: "contact_support",
  continueLearning: "continue_learning",
  requestVerification: "request_verification",
  viewOffer: "view_offer",
  waitForVerification: "wait_for_verification",
} as const satisfies Record<string, AcademyNextAction>;

/** Origin recorded for the academy drip start (`first_activated_at`). */
export type EnrollmentActivationOrigin = "first_grant" | "migration_preserved";

export const ENROLLMENT_ACTIVATION_ORIGIN = {
  firstGrant: "first_grant",
  migrationPreserved: "migration_preserved",
} as const satisfies Record<string, EnrollmentActivationOrigin>;

/** Limits for leader-granted bonuses. */
export const ACADEMY_BONUS_LIMITS = {
  maxDurationDays: 366,
  reasonMaxLength: 500,
  reasonMinLength: 3,
} as const;

/** Limits for the academy offer copy edited by the leader. */
export const ACADEMY_OFFER_LIMITS = {
  benefitMaxLength: 160,
  descriptionMaxLength: 2000,
  maxBenefits: 8,
  titleMaxLength: 120,
} as const;

export const MILLISECONDS_PER_DAY = 86_400_000;

/** Pagination of the academy management member list. */
export const ACADEMY_MEMBERS_PAGE = {
  defaultPageSize: 20,
  maxPageSize: 50,
  searchMaxLength: 80,
} as const;
