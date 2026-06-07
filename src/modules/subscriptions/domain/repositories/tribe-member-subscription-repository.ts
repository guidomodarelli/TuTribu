/**
 * Defines the repository port for member subscription lifecycle workflows.
 *
 * @module tribe-member-subscription-repository
 */

import type {
  TribeMemberSubscriptionStartResult,
  TribeMemberSubscriptionStatusResult,
  TribeMemberSubscriptionWebhookResult,
} from "@/src/modules/subscriptions/application/results/tribe-member-subscription-result";

export type StartCurrentPriceSubscriptionCommand = {
  idempotencyKey: string;
  invitationToken: string;
  tribeSlug: string;
};

export type RetryCurrentPriceSubscriptionPaymentCommand = {
  idempotencyKey: string;
  tribeSlug: string;
};

export type StartOpenJoinSubscriptionCommand = {
  idempotencyKey: string;
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

export type ProviderSubscriptionReturnPathQuery = {
  providerSubscriptionId: string;
};

export type TribeMemberSubscriptionStatusQuery = {
  tribeSlug: string;
};

export type TribeMemberSubscriptionRepository = {
  cancelOwnSubscription(
    query: TribeMemberSubscriptionStatusQuery
  ): Promise<TribeMemberSubscriptionStatusResult>;
  handleWebhook(
    command: MercadoPagoSubscriptionWebhookCommand
  ): Promise<TribeMemberSubscriptionWebhookResult>;
  hasPendingSubscriptionReturn(
    query: PendingSubscriptionReturnQuery
  ): Promise<boolean>;
  reconcileCurrentMemberSubscription(
    query: TribeMemberSubscriptionStatusQuery
  ): Promise<TribeMemberSubscriptionStatusResult>;
  resolveReturnPathByProviderSubscription(
    query: ProviderSubscriptionReturnPathQuery
  ): Promise<string | null>;
  resolveSubscriptionReturn(
    query: PendingSubscriptionReturnQuery
  ): Promise<TribeMemberSubscriptionStatusResult>;
  retryCurrentPriceSubscriptionPayment(
    command: RetryCurrentPriceSubscriptionPaymentCommand
  ): Promise<TribeMemberSubscriptionStartResult>;
  startCurrentPriceSubscription(
    command: StartCurrentPriceSubscriptionCommand
  ): Promise<TribeMemberSubscriptionStartResult>;
  startOpenJoinSubscription(
    command: StartOpenJoinSubscriptionCommand
  ): Promise<TribeMemberSubscriptionStartResult>;
};
