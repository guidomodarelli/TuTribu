/**
 * Provides application result contracts for tribe subscription prices.
 *
 * @module tribe-subscription-price-result
 */

import type {
  TRIBE_SUBSCRIPTION_CURRENCY,
  TRIBE_SUBSCRIPTION_FREQUENCY,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";

export type TribeSubscriptionPriceResult = {
  activeSubscribersCount: number;
  amountCents: number;
  createdAt: string;
  currency: typeof TRIBE_SUBSCRIPTION_CURRENCY.ars;
  frequency: typeof TRIBE_SUBSCRIPTION_FREQUENCY.monthly;
  id: string;
  isCurrent: boolean;
  name: string;
  status: "active" | "canceled" | "deleted";
};

export type TribeSubscriptionPriceListResult = {
  hasMercadoPagoIntegration: boolean;
  prices: TribeSubscriptionPriceResult[];
  viewerPermissions: {
    canManagePrices: boolean;
    canViewPrices: boolean;
  };
};

export type TribeSubscriptionPriceMutationResult =
  | {
      price: TribeSubscriptionPriceResult;
      status:
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.created
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.current
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.updated;
    }
  | {
      status:
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired;
    };

export type TribeSubscriptionProviderPlanSyncResult =
  | {
      price: TribeSubscriptionPriceResult;
      status: typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.verified;
    }
  | {
      status:
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired;
    };

export type TribeSubscriptionProviderPlanVerificationResult =
  | {
      price: TribeSubscriptionPriceResult;
      status: typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.verified;
    }
  | {
      status:
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired;
    };

export type TribeSubscriptionProviderPlansVerificationResult =
  | {
      canceledPriceIds: string[];
      prices: TribeSubscriptionPriceResult[];
      status: typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.verified;
      verifiedCount: number;
    }
  | {
      status:
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired;
    };

export type TribeSubscriptionProviderSubscribersVerificationResult =
  | {
      price: TribeSubscriptionPriceResult;
      providerActiveSubscribersCount: number;
      status: typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.verified;
      verifiedCount: number;
    }
  | {
      status:
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound
        | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired;
    };
