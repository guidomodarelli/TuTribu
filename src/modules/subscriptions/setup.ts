/**
 * Composes subscription module use cases with their repository ports.
 *
 * @module subscriptions-setup
 */

import { connectTribePaymentIntegration } from "@/src/modules/subscriptions/application/use-cases/manage-tribe-payment-integration-use-cases";
import {
  createTribeSubscriptionPrice,
  deleteTribeSubscriptionPrice,
  listTribeSubscriptionPrices,
  makeTribeSubscriptionPriceCurrent,
  setTribeFreeJoinAsCurrent,
  syncMercadoPagoSubscriptionProviderPlanWebhook,
  updateTribeSubscriptionPrice,
  verifyTribeSubscriptionProviderPlan,
  verifyTribeSubscriptionProviderPlans,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-subscription-prices-use-cases";
import { reconcileTribeSubscriptionProviderSubscribers } from "@/src/modules/subscriptions/application/use-cases/reconcile-tribe-subscription-provider-subscribers-use-case";
import {
  getTribeSubscriberDiagnostics,
  reconcileTribeSubscriberDiagnostics,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-subscriber-diagnostics-use-cases";
import {
  cancelOwnTribeMemberSubscription,
  handleMercadoPagoSubscriptionWebhook,
  reconcileCurrentTribeMemberSubscription,
  resolveTribeMemberSubscriptionReturn,
  resolveTribeMemberSubscriptionReturnPath,
  retryTribeMemberSubscriptionPayment,
  startTribeMemberSubscription,
  validatePendingTribeMemberSubscriptionReturn,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-member-subscription-use-cases";
import type { TribeProviderSubscriberReconciliationRepository } from "@/src/modules/subscriptions/application/ports/tribe-provider-subscriber-reconciliation-repository";
import type { TribeSubscriberDiagnosticsRepository } from "@/src/modules/subscriptions/application/ports/tribe-subscriber-diagnostics-repository";
import type { TribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";
import type { TribePaymentIntegrationRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-payment-integration-repository";
import type { TribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";

type SubscriptionsModuleDependencies = {
  tribeMemberSubscriptionRepository: TribeMemberSubscriptionRepository;
  tribePaymentIntegrationRepository: TribePaymentIntegrationRepository;
  tribeProviderSubscriberReconciliationRepository: TribeProviderSubscriberReconciliationRepository;
  tribeSubscriberDiagnosticsRepository: TribeSubscriberDiagnosticsRepository;
  tribeSubscriptionPriceRepository: TribeSubscriptionPriceRepository;
};

/**
 * Builds subscription use cases from concrete repository implementations.
 *
 * @param dependencies - Repository dependencies for the subscriptions module.
 * @returns Subscription module use cases.
 */
export function buildSubscriptionsModule({
  tribeMemberSubscriptionRepository,
  tribePaymentIntegrationRepository,
  tribeProviderSubscriberReconciliationRepository,
  tribeSubscriberDiagnosticsRepository,
  tribeSubscriptionPriceRepository,
}: SubscriptionsModuleDependencies) {
  return {
    useCases: {
      connectTribePaymentIntegration: connectTribePaymentIntegration({
        tribePaymentIntegrationRepository,
      }),
      createTribeSubscriptionPrice: createTribeSubscriptionPrice({
        tribeSubscriptionPriceRepository,
      }),
      deleteTribeSubscriptionPrice: deleteTribeSubscriptionPrice({
        tribeSubscriptionPriceRepository,
      }),
      cancelOwnTribeMemberSubscription: cancelOwnTribeMemberSubscription({
        tribeMemberSubscriptionRepository,
      }),
      handleMercadoPagoSubscriptionWebhook: handleMercadoPagoSubscriptionWebhook({
        tribeMemberSubscriptionRepository,
      }),
      getTribeSubscriberDiagnostics: getTribeSubscriberDiagnostics({
        tribeSubscriberDiagnosticsRepository,
      }),
      listTribeSubscriptionPrices: listTribeSubscriptionPrices({
        tribeSubscriptionPriceRepository,
      }),
      makeTribeSubscriptionPriceCurrent: makeTribeSubscriptionPriceCurrent({
        tribeSubscriptionPriceRepository,
      }),
      setTribeFreeJoinAsCurrent: setTribeFreeJoinAsCurrent({
        tribeSubscriptionPriceRepository,
      }),
      reconcileCurrentTribeMemberSubscription:
        reconcileCurrentTribeMemberSubscription({
          tribeMemberSubscriptionRepository,
        }),
      reconcileTribeSubscriptionProviderSubscribers:
        reconcileTribeSubscriptionProviderSubscribers({
          tribeProviderSubscriberReconciliationRepository,
        }),
      reconcileTribeSubscriberDiagnostics: reconcileTribeSubscriberDiagnostics({
        tribeSubscriberDiagnosticsRepository,
      }),
      resolveTribeMemberSubscriptionReturnPath:
        resolveTribeMemberSubscriptionReturnPath({
          tribeMemberSubscriptionRepository,
        }),
      resolveTribeMemberSubscriptionReturn:
        resolveTribeMemberSubscriptionReturn({
          tribeMemberSubscriptionRepository,
        }),
      retryTribeMemberSubscriptionPayment: retryTribeMemberSubscriptionPayment({
        tribeMemberSubscriptionRepository,
      }),
      syncMercadoPagoSubscriptionProviderPlanWebhook:
        syncMercadoPagoSubscriptionProviderPlanWebhook({
          tribeSubscriptionPriceRepository,
        }),
      startTribeMemberSubscription: startTribeMemberSubscription({
        tribeMemberSubscriptionRepository,
      }),
      validatePendingTribeMemberSubscriptionReturn:
        validatePendingTribeMemberSubscriptionReturn({
          tribeMemberSubscriptionRepository,
        }),
      updateTribeSubscriptionPrice: updateTribeSubscriptionPrice({
        tribeSubscriptionPriceRepository,
      }),
      verifyTribeSubscriptionProviderPlan: verifyTribeSubscriptionProviderPlan({
        tribeSubscriptionPriceRepository,
      }),
      verifyTribeSubscriptionProviderPlans: verifyTribeSubscriptionProviderPlans({
        tribeSubscriptionPriceRepository,
      }),
    },
  };
}
