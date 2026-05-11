/**
 * Provides application use cases for member subscription lifecycle operations.
 *
 * @module manage-tribe-member-subscription-use-cases
 */

import type {
  MercadoPagoSubscriptionWebhookCommand,
  PendingSubscriptionReturnQuery,
  StartCurrentPriceSubscriptionCommand,
  TribeMemberSubscriptionStatusQuery,
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

/**
 * Confirms that a Mercado Pago return belongs to the current pending subscription.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that validates the pending provider subscription.
 */
export function validatePendingTribeMemberSubscriptionReturn({
  tribeMemberSubscriptionRepository,
}: TribeMemberSubscriptionDependencies) {
  return async (query: PendingSubscriptionReturnQuery) =>
    tribeMemberSubscriptionRepository.hasPendingSubscriptionReturn({
      providerSubscriptionId: normalizeText(query.providerSubscriptionId),
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

/**
 * Confirms a Mercado Pago return and applies the resulting access state.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that validates a provider return.
 */
export function confirmTribeMemberSubscriptionReturn({
  tribeMemberSubscriptionRepository,
}: TribeMemberSubscriptionDependencies) {
  return async (query: PendingSubscriptionReturnQuery) =>
    tribeMemberSubscriptionRepository.confirmSubscriptionReturn({
      providerSubscriptionId: normalizeText(query.providerSubscriptionId),
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

/**
 * Reconciles the current member subscription before granting tribe access.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that refreshes local access from Mercado Pago.
 */
export function reconcileCurrentTribeMemberSubscription({
  tribeMemberSubscriptionRepository,
}: TribeMemberSubscriptionDependencies) {
  return async (query: TribeMemberSubscriptionStatusQuery) =>
    tribeMemberSubscriptionRepository.reconcileCurrentMemberSubscription({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

/**
 * Cancels the current member subscription from inside the tribe.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that cancels the provider subscription.
 */
export function cancelOwnTribeMemberSubscription({
  tribeMemberSubscriptionRepository,
}: TribeMemberSubscriptionDependencies) {
  return async (query: TribeMemberSubscriptionStatusQuery) =>
    tribeMemberSubscriptionRepository.cancelOwnSubscription({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}
