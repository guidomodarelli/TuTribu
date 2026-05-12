/**
 * Defines the application port for provider subscriber reconciliation.
 *
 * @module tribe-provider-subscriber-reconciliation-repository
 */

import type { TribeProviderSubscriberReconciliationResult } from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";
import type { TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE } from "@/src/modules/subscriptions/constants/subscriptions";

export type TribeProviderSubscriberReconciliationSource =
  (typeof TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE)[keyof typeof TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE];

export type TribeProviderSubscriberReconciliationCommand = {
  priceId: string;
  source: TribeProviderSubscriberReconciliationSource;
  tribeSlug: string;
};

export type TribeProviderSubscriberReconciliationRepository = {
  reconcileProviderSubscribers(
    command: TribeProviderSubscriberReconciliationCommand
  ): Promise<TribeProviderSubscriberReconciliationResult>;
};
