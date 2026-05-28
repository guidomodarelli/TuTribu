/**
 * Provides use cases for tribe payment provider integrations.
 *
 * @module manage-tribe-payment-integration-use-cases
 */

import type {
  ConnectTribePaymentIntegrationCommand,
  TribePaymentIntegrationRepository,
  UpdateTribePaymentIntegrationAccountLabelCommand,
} from "@/src/modules/subscriptions/domain/repositories/tribe-payment-integration-repository";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { normalizeUuid } from "@/src/modules/shared/application/validation/uuid";

type TribePaymentIntegrationDependencies = {
  tribePaymentIntegrationRepository: TribePaymentIntegrationRepository;
};

const PAYMENT_INTEGRATION_ACCOUNT_LABEL_MAX_LENGTH = 80;

/**
 * Normalizes nullable text fields in integration commands.
 *
 * @param value - Text value to normalize.
 * @returns Trimmed text, or null when the input is null.
 */
function normalizeNullableText(value: string | null): string | null {
  return value ? value.trim() : null;
}

/**
 * Connects a tribe with the leader Mercado Pago account.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that persists provider tokens.
 */
export function connectTribePaymentIntegration({
  tribePaymentIntegrationRepository,
}: TribePaymentIntegrationDependencies) {
  return async (command: ConnectTribePaymentIntegrationCommand) =>
    tribePaymentIntegrationRepository.connect({
      accessToken: command.accessToken.trim(),
      expiresIn: command.expiresIn,
      providerAccountId: normalizeNullableText(command.providerAccountId),
      refreshToken: normalizeNullableText(command.refreshToken),
      tribeSlug: command.tribeSlug.trim(),
    });
}

/**
 * Updates the display label for one connected Mercado Pago account.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that updates an account label.
 */
export function updateTribePaymentIntegrationAccountLabel({
  tribePaymentIntegrationRepository,
}: TribePaymentIntegrationDependencies) {
  return async (command: UpdateTribePaymentIntegrationAccountLabelCommand) => {
    const accountLabel = command.accountLabel.trim();
    const paymentIntegrationId = normalizeUuid(command.paymentIntegrationId);

    if (
      !accountLabel ||
      !paymentIntegrationId ||
      accountLabel.length > PAYMENT_INTEGRATION_ACCOUNT_LABEL_MAX_LENGTH
    ) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
    }

    return tribePaymentIntegrationRepository.updateAccountLabel({
      accountLabel,
      paymentIntegrationId,
      tribeSlug: command.tribeSlug.trim(),
    });
  };
}
