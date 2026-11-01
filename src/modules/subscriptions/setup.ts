/**
 * Composes subscription module use cases with their repository ports.
 *
 * @module subscriptions-setup
 */

import {
  connectTribePaymentIntegration,
  updateTribePaymentIntegrationAccountLabel,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-payment-integration-use-cases";
import {
  createTribeSubscriptionPrice,
  deleteTribeSubscriptionPrice,
  deleteTribeSubscriptionPriceWithInvitationActions,
  getTribeCurrentSubscriptionOffer,
  listTribeSubscriptionPrices,
  makeTribeSubscriptionPriceCurrent,
  setTribeFreeJoinAsCurrent,
  setTribeOpenFreeJoin,
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
  startTribeOpenJoinSubscription,
  validatePendingTribeMemberSubscriptionReturn,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-member-subscription-use-cases";
import {
  cancelOwnAcademyRenewal,
  getOwnAcademyRenewal,
  handleAcademyAuthorizedPaymentWebhook,
  handleAcademyPaymentWebhook,
  reconcileAcademySubscriptionCoverage,
  reconcileOwnAcademyCoverage,
  startAcademySubscription,
} from "@/src/modules/subscriptions/application/use-cases/manage-academy-subscription-use-cases";
import type { AcademySubscriptionRepository } from "@/src/modules/subscriptions/domain/repositories/academy-subscription-repository";
import type { TribeProviderSubscriberReconciliationRepository } from "@/src/modules/subscriptions/application/ports/tribe-provider-subscriber-reconciliation-repository";
import type { TribeSubscriberDiagnosticsRepository } from "@/src/modules/subscriptions/application/ports/tribe-subscriber-diagnostics-repository";
import type { TribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";
import type { TribePaymentIntegrationRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-payment-integration-repository";
import type { TribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";

type SubscriptionsModuleDependencies = {
  academySubscriptionRepository: AcademySubscriptionRepository;
  isAcademySalesActivationAllowed: () => boolean;
  tribeMemberSubscriptionRepository: TribeMemberSubscriptionRepository;
  tribePaymentIntegrationRepository: TribePaymentIntegrationRepository;
  tribeProviderSubscriberReconciliationRepository: TribeProviderSubscriberReconciliationRepository;
  tribeSubscriberDiagnosticsRepository: TribeSubscriberDiagnosticsRepository;
  tribeSubscriptionPriceRepository: TribeSubscriptionPriceRepository;
};

/**
 * Builds the academy subscription use cases.
 *
 * @returns Use cases keyed by name.
 */
function buildAcademySubscriptionUseCases({
  academySubscriptionRepository,
  isAcademySalesActivationAllowed,
}: Pick<
  SubscriptionsModuleDependencies,
  "academySubscriptionRepository" | "isAcademySalesActivationAllowed"
>) {
  return {
    cancelOwnAcademyRenewal: cancelOwnAcademyRenewal({ academySubscriptionRepository }),
    getOwnAcademyRenewal: getOwnAcademyRenewal({ academySubscriptionRepository }),
    handleAcademyAuthorizedPaymentWebhook: handleAcademyAuthorizedPaymentWebhook({
      academySubscriptionRepository,
    }),
    handleAcademyPaymentWebhook: handleAcademyPaymentWebhook({ academySubscriptionRepository }),
    reconcileAcademySubscriptionCoverage: reconcileAcademySubscriptionCoverage({
      academySubscriptionRepository,
    }),
    reconcileOwnAcademyCoverage: reconcileOwnAcademyCoverage({ academySubscriptionRepository }),
    startAcademySubscription: startAcademySubscription({
      academySubscriptionRepository,
      isAcademySalesActivationAllowed,
    }),
  };
}

/**
 * Builds the payment integration use cases.
 *
 * @returns Use cases keyed by name.
 */
function buildPaymentIntegrationUseCases(tribePaymentIntegrationRepository: TribePaymentIntegrationRepository) {
  return {
    connectTribePaymentIntegration: connectTribePaymentIntegration({
      tribePaymentIntegrationRepository,
    }),
    updateTribePaymentIntegrationAccountLabel:
      updateTribePaymentIntegrationAccountLabel({
        tribePaymentIntegrationRepository,
      }),
  };
}

/**
 * Builds the subscription price use cases.
 *
 * @returns Use cases keyed by name.
 */
function buildSubscriptionPriceUseCases(tribeSubscriptionPriceRepository: TribeSubscriptionPriceRepository) {
  return {
    createTribeSubscriptionPrice: createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository,
    }),
    deleteTribeSubscriptionPrice: deleteTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository,
    }),
    deleteTribeSubscriptionPriceWithInvitationActions:
      deleteTribeSubscriptionPriceWithInvitationActions({
        tribeSubscriptionPriceRepository,
      }),
    listTribeSubscriptionPrices: listTribeSubscriptionPrices({
      tribeSubscriptionPriceRepository,
    }),
    getTribeCurrentSubscriptionOffer: getTribeCurrentSubscriptionOffer({
      tribeSubscriptionPriceRepository,
    }),
    makeTribeSubscriptionPriceCurrent: makeTribeSubscriptionPriceCurrent({
      tribeSubscriptionPriceRepository,
    }),
    setTribeOpenFreeJoin: setTribeOpenFreeJoin({
      tribeSubscriptionPriceRepository,
    }),
    setTribeFreeJoinAsCurrent: setTribeFreeJoinAsCurrent({
      tribeSubscriptionPriceRepository,
    }),
    syncMercadoPagoSubscriptionProviderPlanWebhook:
      syncMercadoPagoSubscriptionProviderPlanWebhook({
        tribeSubscriptionPriceRepository,
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
  };
}

/**
 * Builds the member subscription use cases.
 *
 * @returns Use cases keyed by name.
 */
function buildMemberSubscriptionUseCases(tribeMemberSubscriptionRepository: TribeMemberSubscriptionRepository) {
  return {
    cancelOwnTribeMemberSubscription: cancelOwnTribeMemberSubscription({
      tribeMemberSubscriptionRepository,
    }),
    handleMercadoPagoSubscriptionWebhook: handleMercadoPagoSubscriptionWebhook({
      tribeMemberSubscriptionRepository,
    }),
    reconcileCurrentTribeMemberSubscription:
      reconcileCurrentTribeMemberSubscription({
        tribeMemberSubscriptionRepository,
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
    startTribeMemberSubscription: startTribeMemberSubscription({
      tribeMemberSubscriptionRepository,
    }),
    startTribeOpenJoinSubscription: startTribeOpenJoinSubscription({
      tribeMemberSubscriptionRepository,
    }),
    validatePendingTribeMemberSubscriptionReturn:
      validatePendingTribeMemberSubscriptionReturn({
        tribeMemberSubscriptionRepository,
      }),
  };
}

/**
 * Builds subscription use cases from concrete repository implementations.
 *
 * @param dependencies - Repository dependencies for the subscriptions module.
 * @returns Subscription module use cases.
 */
export function buildSubscriptionsModule({
  academySubscriptionRepository,
  isAcademySalesActivationAllowed,
  tribeMemberSubscriptionRepository,
  tribePaymentIntegrationRepository,
  tribeProviderSubscriberReconciliationRepository,
  tribeSubscriberDiagnosticsRepository,
  tribeSubscriptionPriceRepository,
}: SubscriptionsModuleDependencies) {
  return {
    useCases: {
      ...buildAcademySubscriptionUseCases({ academySubscriptionRepository, isAcademySalesActivationAllowed }),
      ...buildPaymentIntegrationUseCases(tribePaymentIntegrationRepository),
      ...buildSubscriptionPriceUseCases(tribeSubscriptionPriceRepository),
      ...buildMemberSubscriptionUseCases(tribeMemberSubscriptionRepository),
      getTribeSubscriberDiagnostics: getTribeSubscriberDiagnostics({
        tribeSubscriberDiagnosticsRepository,
      }),
      reconcileTribeSubscriptionProviderSubscribers:
        reconcileTribeSubscriptionProviderSubscribers({
          tribeProviderSubscriberReconciliationRepository,
        }),
      reconcileTribeSubscriberDiagnostics: reconcileTribeSubscriberDiagnostics({
        tribeSubscriberDiagnosticsRepository,
      }),
    },
  };
}
