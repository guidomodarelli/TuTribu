/**
 * Provides application result contracts for tribe subscription prices.
 *
 * @module tribe-subscription-price-result
 */

import type {
  MERCADO_PAGO_CONNECTION_STATUS,
  TRIBE_SUBSCRIPTION_CURRENCY,
  TRIBE_SUBSCRIPTION_FREQUENCY,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
  TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE,
} from "@/src/modules/subscriptions/constants/subscriptions";

export type TribeSubscriptionPriceResult = {
  activeSubscribersCount: number;
  amountCents: number;
  createdAt: string;
  currency: typeof TRIBE_SUBSCRIPTION_CURRENCY.ars;
  frequency: typeof TRIBE_SUBSCRIPTION_FREQUENCY.monthly;
  id: string;
  isCurrent: boolean;
  mercadoPagoAccountEmail?: string | null;
  mercadoPagoAccountLabel?: string | null;
  name: string;
  paymentIntegrationId?: string | null;
  providerAccountId?: string | null;
  status: "active" | "canceled" | "deleted" | "paused";
  trial: {
    frequency: number;
    frequencyType:
      | typeof TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days
      | typeof TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.months;
  } | null;
};

export type TribeMercadoPagoAccountResult = {
  accountLabel: string;
  id: string;
  providerAccountEmail: string | null;
  providerAccountId: string | null;
  status:
    | typeof MERCADO_PAGO_CONNECTION_STATUS.connected
    | typeof MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection;
};

export type TribeSubscriptionPriceListResult = {
  availableMercadoPagoAccounts?: TribeMercadoPagoAccountResult[];
  freeJoinIsCurrent: boolean;
  hasMercadoPagoIntegration: boolean;
  mercadoPagoConnectionStatus:
    | typeof MERCADO_PAGO_CONNECTION_STATUS.connected
    | typeof MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection;
  prices: TribeSubscriptionPriceResult[];
  viewerPermissions: {
    canManagePrices: boolean;
    canViewPrices: boolean;
  };
};

export type TribeFreeJoinMutationResult = {
  status:
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.current
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound;
};

export type TribeSubscriberDiagnosticsResult = {
  lastReconciledAt?: string;
  localActiveSubscribersCount: number;
  mercadoPagoAuthorizedSubscribersCount: number;
  mercadoPagoCanceledOrMissingSubscribersCount: number;
  mercadoPagoPausedSubscribersCount: number;
  mercadoPagoPendingSubscribersCount: number;
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
      linkedInvitationIds: string[];
      status: typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.hasLinkedInvitations;
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
      freeJoinIsCurrent?: boolean;
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
      freeJoinIsCurrent: boolean;
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

export type TribeProviderSubscriberReconciliationResult =
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

export type TribeSubscriberDiagnosticsReconciliationResult =
  | {
      diagnostics: TribeSubscriberDiagnosticsResult;
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
