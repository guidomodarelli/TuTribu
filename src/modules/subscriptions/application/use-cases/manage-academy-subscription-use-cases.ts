/**
 * Academy subscription use cases for existing members. The buyer is always
 * the session user; the input never selects a price, amount or product.
 *
 * @module manage-academy-subscription-use-cases
 */

import type {
  AcademyAuthorizedPaymentWebhookResult,
  AcademyCoverageReconciliationResult,
  AcademyPaymentWebhookCommand,
  AcademyPaymentWebhookResult,
  AcademySubscriptionRepository,
  CancelAcademyRenewalResult,
  StartAcademyCheckoutResult,
} from "@/src/modules/subscriptions/domain/repositories/academy-subscription-repository";
import type { AcademySubscriptionRenewalStatus } from "@/src/modules/subscriptions/constants/subscriptions";

type Dependencies = {
  academySubscriptionRepository: AcademySubscriptionRepository;
};

function normalizeSlug(tribeSlug: string): string {
  return tribeSlug.trim().toLowerCase();
}

/**
 * Starts (or resumes) the academy checkout. Sales stay closed while the
 * deployment has not enabled them, even if a tribe row says otherwise.
 */
export function startAcademySubscription({
  academySubscriptionRepository,
  isAcademySalesActivationAllowed,
}: Dependencies & { isAcademySalesActivationAllowed: () => boolean }) {
  return async (command: {
    acceptedOfferVersion: number;
    correlationId: string;
    tribeSlug: string;
  }): Promise<StartAcademyCheckoutResult | { status: "invalid_input" }> => {
    if (!Number.isInteger(command.acceptedOfferVersion) || command.acceptedOfferVersion < 1) {
      return { status: "invalid_input" };
    }

    if (!isAcademySalesActivationAllowed()) {
      return { status: "sales_closed" };
    }

    return academySubscriptionRepository.startCheckout({
      ...command,
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
  };
}

export function getOwnAcademyRenewalStatus({ academySubscriptionRepository }: Dependencies) {
  return async ({ tribeSlug }: { tribeSlug: string }): Promise<AcademySubscriptionRenewalStatus> =>
    academySubscriptionRepository.getOwnRenewalStatus({ tribeSlug: normalizeSlug(tribeSlug) });
}

export function cancelOwnAcademyRenewal({ academySubscriptionRepository }: Dependencies) {
  return async (command: {
    correlationId: string;
    tribeSlug: string;
  }): Promise<CancelAcademyRenewalResult> =>
    academySubscriptionRepository.cancelOwnRenewal({
      ...command,
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
}

export function reconcileOwnAcademyCoverage({ academySubscriptionRepository }: Dependencies) {
  return async (command: {
    correlationId: string;
    tribeSlug: string;
  }): Promise<AcademyCoverageReconciliationResult> =>
    academySubscriptionRepository.reconcileOwnCoverage({
      ...command,
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
}

export function reconcileAcademySubscriptionCoverage({
  academySubscriptionRepository,
}: Dependencies) {
  return async (command: {
    correlationId: string;
    providerSubscriptionId: string;
  }): Promise<AcademyCoverageReconciliationResult> =>
    academySubscriptionRepository.reconcileSubscriptionCoverage(command);
}

export function handleAcademyAuthorizedPaymentWebhook({
  academySubscriptionRepository,
}: Dependencies) {
  return async (command: {
    correlationId: string;
    providerAccountId: string | null;
    resourceId: string;
  }): Promise<AcademyAuthorizedPaymentWebhookResult> =>
    academySubscriptionRepository.handleAuthorizedPaymentWebhook(command);
}

/**
 * Reconciles invoices associated with a signed payment update through the recorded ledger.
 * @param dependencies - Academy repository owning authoritative payment reconciliation.
 * @returns A handler that preserves retryable failures and never trusts the notification state.
 */
export function handleAcademyPaymentWebhook({ academySubscriptionRepository }: Dependencies) {
  return async (command: AcademyPaymentWebhookCommand): Promise<AcademyPaymentWebhookResult> =>
    academySubscriptionRepository.handlePaymentWebhook(command);
}
