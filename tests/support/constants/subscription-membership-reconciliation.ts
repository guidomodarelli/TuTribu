/** Owns synthetic reconciliation settings and the public access regression matrix. @module subscription-membership-reconciliation-test-constants */
import { PRODUCT_KEY } from "@/src/modules/product-access/constants/product-access";

/** Identifies the three production payment entrypoints exercised by the regression. */
export type SubscriptionReconciliationEntrypoint = "price" | "diagnostics" | "member";
/** Keeps test products explicit instead of deriving a type from the case array. */
export type SubscriptionReconciliationProduct = "membership" | "academy";

/** Names the production entrypoint selected by each controlled test case. */
export const SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT = { price: "price", diagnostics: "diagnostics", member: "member" } as const satisfies Record<string, SubscriptionReconciliationEntrypoint>;

/** Applies the same native admission guards as the existing payment fixture. */
export const SUBSCRIPTION_MEMBERSHIP_MIGRATIONS: readonly string[] = [
  "20261005090000_create_admission_identity_evidence.sql",
  "20261005091000_create_academy_admission_core.sql",
  "20261005091500_guard_admission_evidence_transitions.sql",
  "20261005092000_create_tenant_messaging.sql",
  "20261005092500_guard_messaging_attempts.sql",
  "20261005093000_guard_academy_membership_sources.sql",
  "20261006180000_guard_subscription_membership_sources.sql",
  "20261006200000_scope_admission_audit_operations.sql",
  "20261006220000_extend_admission_notifications.sql",
  "20261007020000_resolve_paid_admission_requests.sql",
  "20261007023000_close_unavailable_admission_requests.sql",
  // The membership reconciliation skips memberships the first activation converted into free members.
  "20261031120000_convert_commercial_memberships_on_admission_activation.sql",
];

/** Defines only synthetic names, amounts and bounded fixture durations. */
export const SUBSCRIPTION_MEMBERSHIP_FIXTURE = {
  amountCents: 1500,
  grantLifetimeDays: 30,
  accountName: "Synthetic reconciliation account",
  tribeName: "Synthetic reconciliation tribe",
  priceName: "Synthetic price",
  integrationLabel: "Synthetic account",
  provider: "mercado_pago",
  basicCourseTitle: "Curso básico de ejemplo",
  academyCourseTitle: "Curso de academia de ejemplo",
  providerAuthorizedStatus: "authorized",
  providerWebhookTopic: "subscription_preapproval",
} as const;

/** Allows a native branch and its ordered cleanup to finish without unbounded waiting. */
export const SUBSCRIPTION_MEMBERSHIP_SQL_TEST_TIMEOUT_MS = 180_000;

/** Exercises each actual entrypoint against both independently owned products. */
export const SUBSCRIPTION_MEMBERSHIP_ACCESS_CASES = [
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price, product: PRODUCT_KEY.membership },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.diagnostics, product: PRODUCT_KEY.membership },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member, product: PRODUCT_KEY.membership },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price, product: PRODUCT_KEY.academy },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.diagnostics, product: PRODUCT_KEY.academy },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member, product: PRODUCT_KEY.academy },
] as const satisfies readonly { entrypoint: SubscriptionReconciliationEntrypoint; product: SubscriptionReconciliationProduct }[];
