/**
 * Defines the repository port for tribe subscription price management.
 *
 * @module tribe-subscription-price-repository
 */

import type {
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
} from "@/src/modules/subscriptions/constants/subscriptions";

export type CreateTribeSubscriptionPriceCommand = {
  amountCents: number;
  currency: typeof TRIBE_SUBSCRIPTION_CURRENCY.ars;
  frequency: typeof TRIBE_SUBSCRIPTION_FREQUENCY.monthly;
  name: string;
  trialFrequency: number | null;
  trialFrequencyType:
    | typeof TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days
    | typeof TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.months
    | null;
  tribeSlug: string;
};

export type UpdateTribeSubscriptionPriceCommand = Omit<
  CreateTribeSubscriptionPriceCommand,
  "trialFrequency" | "trialFrequencyType"
> & {
  priceId: string;
  trialFrequency?: CreateTribeSubscriptionPriceCommand["trialFrequency"];
  trialFrequencyType?: CreateTribeSubscriptionPriceCommand["trialFrequencyType"];
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

export type TribeSubscriptionPriceRepository = {
  create(
    command: CreateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult>;
  delete(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult>;
  listByTribeSlug(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionPriceListResult>;
  makeCurrent(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult>;
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
