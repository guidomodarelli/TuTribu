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
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-subscription-prices-use-cases";
import {
  handleMercadoPagoSubscriptionWebhook,
  startTribeMemberSubscription,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-member-subscription-use-cases";
import type { TribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";
import type { TribePaymentIntegrationRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-payment-integration-repository";
import type { TribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";

type SubscriptionsModuleDependencies = {
  tribeMemberSubscriptionRepository: TribeMemberSubscriptionRepository;
  tribePaymentIntegrationRepository: TribePaymentIntegrationRepository;
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
      handleMercadoPagoSubscriptionWebhook: handleMercadoPagoSubscriptionWebhook({
        tribeMemberSubscriptionRepository,
      }),
      listTribeSubscriptionPrices: listTribeSubscriptionPrices({
        tribeSubscriptionPriceRepository,
      }),
      makeTribeSubscriptionPriceCurrent: makeTribeSubscriptionPriceCurrent({
        tribeSubscriptionPriceRepository,
      }),
      startTribeMemberSubscription: startTribeMemberSubscription({
        tribeMemberSubscriptionRepository,
      }),
    },
  };
}
