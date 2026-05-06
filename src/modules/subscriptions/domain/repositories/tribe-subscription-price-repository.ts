/**
 * Defines the repository port for tribe subscription price management.
 *
 * @module tribe-subscription-price-repository
 */

import type {
  TribeSubscriptionPriceListResult,
  TribeSubscriptionPriceMutationResult,
} from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";
import type {
  TRIBE_SUBSCRIPTION_CURRENCY,
  TRIBE_SUBSCRIPTION_FREQUENCY,
} from "@/src/modules/subscriptions/constants/subscriptions";

export type CreateTribeSubscriptionPriceCommand = {
  amountCents: number;
  currency: typeof TRIBE_SUBSCRIPTION_CURRENCY.ars;
  frequency: typeof TRIBE_SUBSCRIPTION_FREQUENCY.monthly;
  name: string;
  tribeSlug: string;
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
};
