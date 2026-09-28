/**
 * Defines the repository port for tribe subscription price management.
 *
 * @module tribe-subscription-price-repository
 */

import type {
  TribeCurrentSubscriptionOfferResult,
  TribeFreeJoinMutationResult,
  TribeSubscriptionProviderPlanVerificationResult,
  TribeSubscriptionProviderPlansVerificationResult,
  TribeSubscriptionProviderPlanSyncResult,
  TribeSubscriptionPriceListResult,
  TribeSubscriptionPriceMutationResult,
} from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";
import type {
  TRIBE_SUBSCRIPTION_CURRENCY,
  TRIBE_SUBSCRIPTION_FREQUENCY,
  TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE,
  TribeSubscriptionProductKey,
} from "@/src/modules/subscriptions/constants/subscriptions";

export type CreateTribeSubscriptionPriceCommand = {
  amountCents: number;
  currency: typeof TRIBE_SUBSCRIPTION_CURRENCY.ars;
  frequency: typeof TRIBE_SUBSCRIPTION_FREQUENCY.monthly;
  name: string;
  paymentIntegrationId: string;
  /** Omitted means `membership`, the historical behavior. */
  productKey?: TribeSubscriptionProductKey;
  trialFrequency: number | null;
  trialFrequencyType:
    | typeof TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days
    | typeof TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.months
    | null;
  tribeSlug: string;
};

export type UpdateTribeSubscriptionPriceCommand = Omit<
  CreateTribeSubscriptionPriceCommand,
  "paymentIntegrationId" | "productKey" | "trialFrequency" | "trialFrequencyType"
> & {
  priceId: string;
  trialFrequency?: CreateTribeSubscriptionPriceCommand["trialFrequency"];
  trialFrequencyType?: CreateTribeSubscriptionPriceCommand["trialFrequencyType"];
};

export type TribeSubscriptionPriceUpdateTrialPolicy = {
  amountCents: CreateTribeSubscriptionPriceCommand["amountCents"];
  hasMercadoPagoPreapprovalPlan: boolean;
  trialFrequency: CreateTribeSubscriptionPriceCommand["trialFrequency"];
  trialFrequencyType: CreateTribeSubscriptionPriceCommand["trialFrequencyType"];
};

export type SyncTribeSubscriptionProviderPlanCommand = {
  eventId: string;
  resourceId: string;
  topic: string;
};

export type TribeSubscriptionPriceIdentity = {
  priceId: string;
  tribeSlug: string;
};

export type TribeSubscriptionPriceListQuery = {
  tribeSlug: string;
};

export type SetTribeFreeJoinAsCurrentCommand = {
  tribeSlug: string;
};

export type SetTribeOpenFreeJoinCommand = {
  enabled: boolean;
  tribeSlug: string;
};

export type DeleteTribeSubscriptionPriceWithInvitationActionsCommand =
  TribeSubscriptionPriceIdentity & {
    invitationActions: DeleteTribeSubscriptionPriceInvitationAction[];
  };

export type DeleteTribeSubscriptionPriceInvitationAction =
  | {
      action: "switch_to_current";
      invitationId: string;
    }
  | {
      action: "switch_to_specific";
      invitationId: string;
      targetPriceId: string;
    }
  | {
      action: "revoke";
      invitationId: string;
    };

export type TribeSubscriptionPriceRepository = {
  create(
    command: CreateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult>;
  delete(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult>;
  getCurrentSubscriptionOffer(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeCurrentSubscriptionOfferResult>;
  deleteWithInvitationActions(
    command: DeleteTribeSubscriptionPriceWithInvitationActionsCommand
  ): Promise<TribeSubscriptionPriceMutationResult>;
  listByTribeSlug(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionPriceListResult>;
  getUpdateTrialPolicy(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceUpdateTrialPolicy | null>;
  makeCurrent(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult>;
  setFreeJoinAsCurrent(
    command: SetTribeFreeJoinAsCurrentCommand
  ): Promise<TribeFreeJoinMutationResult>;
  setOpenFreeJoin(
    command: SetTribeOpenFreeJoinCommand
  ): Promise<TribeFreeJoinMutationResult>;
  syncProviderPlan(
    command: SyncTribeSubscriptionProviderPlanCommand
  ): Promise<TribeSubscriptionProviderPlanSyncResult>;
  update(
    command: UpdateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult>;
  verifyProviderPlan(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionProviderPlanVerificationResult>;
  verifyProviderPlans(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionProviderPlansVerificationResult>;
};
