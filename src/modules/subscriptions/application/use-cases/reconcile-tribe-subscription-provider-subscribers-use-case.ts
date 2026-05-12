/**
 * Provides the reusable use case for provider subscriber reconciliation.
 *
 * @module reconcile-tribe-subscription-provider-subscribers-use-case
 */

import type {
  TribeProviderSubscriberReconciliationCommand,
  TribeProviderSubscriberReconciliationRepository,
} from "@/src/modules/subscriptions/application/ports/tribe-provider-subscriber-reconciliation-repository";

type TribeProviderSubscriberReconciliationDependencies = {
  tribeProviderSubscriberReconciliationRepository: TribeProviderSubscriberReconciliationRepository;
};

/**
 * Normalizes external trigger and route text values.
 *
 * @param value - Text value received from a route, webhook, job, or admin flow.
 * @returns Trimmed text value.
 */
function normalizeText(value: string): string {
  return value.trim();
}

/**
 * Reconciles provider subscribers for a tribe subscription price from any trigger.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that refreshes local subscriber state from Mercado Pago.
 */
export function reconcileTribeSubscriptionProviderSubscribers({
  tribeProviderSubscriberReconciliationRepository,
}: TribeProviderSubscriberReconciliationDependencies) {
  return async (command: TribeProviderSubscriberReconciliationCommand) =>
    tribeProviderSubscriberReconciliationRepository.reconcileProviderSubscribers({
      priceId: normalizeText(command.priceId),
      source: command.source,
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
