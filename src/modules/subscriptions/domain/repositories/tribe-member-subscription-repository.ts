/**
 * Defines the repository port for member subscription lifecycle workflows.
 *
 * @module tribe-member-subscription-repository
 */

import type {
  TribeMemberSubscriptionStartResult,
  TribeMemberSubscriptionWebhookResult,
} from "@/src/modules/subscriptions/application/results/tribe-member-subscription-result";

export type StartCurrentPriceSubscriptionCommand = {
  idempotencyKey: string;
  invitationToken: string;
  tribeSlug: string;
};

export type MercadoPagoSubscriptionWebhookCommand = {
  eventId: string;
  resourceId: string;
  topic: string;
};

export type PendingSubscriptionReturnQuery = {
  providerSubscriptionId: string;
  tribeSlug: string;
};

export type TribeMemberSubscriptionRepository = {
  handleWebhook(
    command: MercadoPagoSubscriptionWebhookCommand
  ): Promise<TribeMemberSubscriptionWebhookResult>;
  hasPendingSubscriptionReturn(
    query: PendingSubscriptionReturnQuery
  ): Promise<boolean>;
  startCurrentPriceSubscription(
    command: StartCurrentPriceSubscriptionCommand
  ): Promise<TribeMemberSubscriptionStartResult>;
};
