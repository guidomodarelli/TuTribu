/**
 * Defines the repository port for tribe payment provider integrations.
 *
 * @module tribe-payment-integration-repository
 */

import type { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";

export type ConnectTribePaymentIntegrationCommand = {
  accessToken: string;
  expiresIn: number | null;
  providerAccountId: string | null;
  refreshToken: string | null;
  tribeSlug: string;
};

export type TribePaymentIntegrationResult = {
  status:
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.connected
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound;
};

export type TribePaymentIntegrationRepository = {
  connect(
    command: ConnectTribePaymentIntegrationCommand
  ): Promise<TribePaymentIntegrationResult>;
};
