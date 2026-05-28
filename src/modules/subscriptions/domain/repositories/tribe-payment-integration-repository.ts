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

export type UpdateTribePaymentIntegrationAccountLabelCommand = {
  accountLabel: string;
  paymentIntegrationId: string;
  tribeSlug: string;
};

export type TribePaymentIntegrationAccountResult = {
  accountLabel: string;
  id: string;
  providerAccountEmail: string | null;
  providerAccountId: string | null;
  status: string;
};

export type TribePaymentIntegrationResult = {
  status:
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.connected
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.updated
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound;
  account?: TribePaymentIntegrationAccountResult;
};

export type TribePaymentIntegrationRepository = {
  connect(
    command: ConnectTribePaymentIntegrationCommand
  ): Promise<TribePaymentIntegrationResult>;
  updateAccountLabel(
    command: UpdateTribePaymentIntegrationAccountLabelCommand
  ): Promise<TribePaymentIntegrationResult>;
};
