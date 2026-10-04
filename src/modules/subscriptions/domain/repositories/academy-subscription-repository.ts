/**
 * Port of academy subscriptions: checkout for existing members, renewal
 * management and coverage derived from verified provider invoices.
 *
 * @module academy-subscription-repository
 */

import type { AcademySubscriptionRenewalStatus } from "@/src/modules/subscriptions/constants/subscriptions";

export type StartAcademyCheckoutCommand = {
  /** Offer version the member saw and accepted; a newer one must be re-read. */
  acceptedOfferVersion: number;
  correlationId: string;
  tribeSlug: string;
};

export type StartAcademyCheckoutResult =
  | { checkoutUrl: string; status: "redirect" }
  | {
      status:
        | "already_subscribed"
        | "checkout_unresolved"
        | "covered"
        | "forbidden"
        | "not_eligible"
        | "not_found"
        | "offer_changed"
        | "provider_unavailable"
        | "sales_closed";
    };

export type CancelAcademyRenewalResult = {
  status: "canceled" | "not_found" | "provider_unavailable";
};

export type AcademyCoverageReconciliationResult = {
  appliedInvoices: number;
  status: "not_found" | "provider_unavailable" | "reconciled" | "throttled";
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
  getOwnRenewalStatus(query: { tribeSlug: string }): Promise<AcademySubscriptionRenewalStatus>;
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
