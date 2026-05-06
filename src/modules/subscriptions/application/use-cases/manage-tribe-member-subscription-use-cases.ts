/**
 * Provides application use cases for member subscription lifecycle operations.
 *
 * @module manage-tribe-member-subscription-use-cases
 */

import type {
  MercadoPagoSubscriptionWebhookCommand,
  StartCurrentPriceSubscriptionCommand,
  TribeMemberSubscriptionRepository,
} from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";

type TribeMemberSubscriptionDependencies = {
  tribeMemberSubscriptionRepository: TribeMemberSubscriptionRepository;
};

/**
 * Normalizes user or provider text values.
 *
 * @param value - Text value received from a route or provider webhook.
 * @returns Trimmed text value.
 */
function normalizeText(value: string): string {
  return value.trim();
}

/**
 * Starts a member subscription against the current tribe price.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that starts a Mercado Pago subscription.
 */
export function startTribeMemberSubscription({
  tribeMemberSubscriptionRepository,
}: TribeMemberSubscriptionDependencies) {
  return async (command: StartCurrentPriceSubscriptionCommand) =>
    tribeMemberSubscriptionRepository.startCurrentPriceSubscription({
      idempotencyKey: normalizeText(command.idempotencyKey),
      invitationToken: normalizeText(command.invitationToken),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

/**
 * Handles a Mercado Pago subscription webhook idempotently.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that reconciles a provider webhook.
 */
export function handleMercadoPagoSubscriptionWebhook({
  tribeMemberSubscriptionRepository,
}: TribeMemberSubscriptionDependencies) {
  return async (command: MercadoPagoSubscriptionWebhookCommand) =>
    tribeMemberSubscriptionRepository.handleWebhook({
      eventId: normalizeText(command.eventId),
      resourceId: normalizeText(command.resourceId),
      topic: normalizeText(command.topic),
    });
}
