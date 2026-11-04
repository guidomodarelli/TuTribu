/**
 * Port of academy subscriptions: checkout for existing members, renewal
 * management and coverage derived from verified provider invoices.
 *
 * @module academy-subscription-repository
 */

import type { AcademySubscriptionRenewalStatus } from "@/src/modules/subscriptions/constants/subscriptions";
import type { AcademySubscriptionProviderError } from "@/src/modules/subscriptions/domain/errors/academy-subscription-provider-error";

/** Academy price the member saw before contracting. */
export type AcademyAcceptedPrice = {
  amountCents: number;
  currency: string;
};

export type StartAcademyCheckoutCommand = {
  /**
   * Price the member saw; a different current price answers `offer_changed`.
   * `undefined` comes from a page rendered before this field existed.
   */
  acceptedPrice?: AcademyAcceptedPrice | null;
  /** Offer version the member saw and accepted; a newer one must be re-read. */
  acceptedOfferVersion: number;
  correlationId: string;
  tribeSlug: string;
};

/** Private cause of a provider-dependent failure, logged by the route and never serialized. */
type ProviderFailureCause = { cause?: AcademySubscriptionProviderError };

export type StartAcademyCheckoutResult =
  | { checkoutUrl: string; status: "redirect" }
  | {
      status:
        | "already_subscribed"
        | "covered"
        | "forbidden"
        | "not_eligible"
        | "not_found"
        | "offer_changed"
        | "sales_closed";
    }
  | ({
      status:
        | "checkout_unresolved"
        | "integration_unavailable"
        | "provider_rejected"
        | "provider_unavailable";
    } & ProviderFailureCause);

export type CancelAcademyRenewalResult =
  | { status: "canceled" | "not_found" }
  | ({
      /**
       * `cancel_unconfirmed`: the provider may have applied the cancellation
       * but did not confirm it; the request stays recorded (`canceling`) and
       * the next reconciliation completes it.
       */
      status: "cancel_unconfirmed" | "integration_unavailable" | "provider_rejected" | "provider_unavailable";
    } & ProviderFailureCause);

export type AcademyCoverageReconciliationResult =
  | { appliedInvoices: number; status: "not_found" | "reconciled" | "throttled" }
  | ({
      appliedInvoices: number;
      status: "integration_unavailable" | "provider_unavailable";
    } & ProviderFailureCause);

/** Renewal of the member's latest academy subscription that reached the provider. */
export type OwnAcademyRenewal = {
  /** The last recorded invoice of that subscription was rejected by the provider. */
  lastPaymentRejected: boolean;
  status: AcademySubscriptionRenewalStatus;
};

export type AcademyAuthorizedPaymentWebhookCommand = {
  correlationId: string;
  /** Optional seller hint; real invoice notifications can omit user_id. */
  providerAccountId: string | null;
  resourceId: string;
};

/** Identifies a signed payment whose previously verified invoice may have changed. */
export type AcademyPaymentWebhookCommand = {
  correlationId: string;
  providerAccountId: string | null;
  providerPaymentId: string;
};

/** Reports whether authoritative reconciliation completed or requires redelivery. */
export type AcademyPaymentWebhookResult = {
  status: "ignored" | "processed" | "retryable";
};

export type AcademyAuthorizedPaymentWebhookResult = AcademyPaymentWebhookResult;

export type AcademySubscriptionRepository = {
  cancelOwnRenewal(command: {
    correlationId: string;
    tribeSlug: string;
  }): Promise<CancelAcademyRenewalResult>;
  getOwnRenewal(query: { tribeSlug: string }): Promise<OwnAcademyRenewal>;
  handleAuthorizedPaymentWebhook(
    command: AcademyAuthorizedPaymentWebhookCommand
  ): Promise<AcademyAuthorizedPaymentWebhookResult>;
  handlePaymentWebhook(command: AcademyPaymentWebhookCommand): Promise<AcademyPaymentWebhookResult>;
  reconcileOwnCoverage(command: {
    correlationId: string;
    tribeSlug: string;
  }): Promise<AcademyCoverageReconciliationResult>;
  reconcileSubscriptionCoverage(command: {
    correlationId: string;
    providerSubscriptionId: string;
  }): Promise<AcademyCoverageReconciliationResult>;
  startCheckout(command: StartAcademyCheckoutCommand): Promise<StartAcademyCheckoutResult>;
};
