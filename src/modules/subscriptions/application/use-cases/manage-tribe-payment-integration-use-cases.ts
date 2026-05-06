/**
 * Provides use cases for tribe payment provider integrations.
 *
 * @module manage-tribe-payment-integration-use-cases
 */

import type {
  ConnectTribePaymentIntegrationCommand,
  TribePaymentIntegrationRepository,
} from "@/src/modules/subscriptions/domain/repositories/tribe-payment-integration-repository";

type TribePaymentIntegrationDependencies = {
  tribePaymentIntegrationRepository: TribePaymentIntegrationRepository;
};

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
