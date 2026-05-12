/**
 * Maps Mercado Pago subscription statuses into local subscription state.
 *
 * @module mercado-pago-subscription-status-mapper
 */

import {
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
} from "@/src/modules/subscriptions/constants/subscriptions";

/**
 * Defines Mercado Pago preapproval statuses that affect local subscriptions.
 */
export const MERCADO_PAGO_SUBSCRIPTION_STATUS = {
  authorized: "authorized",
  canceled: "canceled",
  cancelled: "cancelled",
  paused: "paused",
  pending: "pending",
} as const;

type MercadoPagoMappedSubscriptionStatus =
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.active
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending;

type MercadoPagoMappedSubscriptionStatusReason =
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive;

/**
 * Describes the local interpretation of a Mercado Pago subscription status.
 */
export type MercadoPagoSubscriptionStatusMapping = {
  isAttachedToProviderPlan: boolean;
  status: MercadoPagoMappedSubscriptionStatus;
  statusReason: MercadoPagoMappedSubscriptionStatusReason;
};

/**
 * Maps Mercado Pago preapproval statuses into local access and price association state.
 *
 * @param providerStatus - Status returned by Mercado Pago for a preapproval.
 * @returns Local subscription status, reason, and provider plan attachment state.
 */
export function mapMercadoPagoSubscriptionStatus(
  providerStatus: string | null
): MercadoPagoSubscriptionStatusMapping {
  switch (providerStatus) {
    case MERCADO_PAGO_SUBSCRIPTION_STATUS.authorized:
      return {
        isAttachedToProviderPlan: true,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.active,
        statusReason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none,
      };
    case MERCADO_PAGO_SUBSCRIPTION_STATUS.canceled:
    case MERCADO_PAGO_SUBSCRIPTION_STATUS.cancelled:
    case null:
      return {
        isAttachedToProviderPlan: false,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
        statusReason:
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive,
      };
    case MERCADO_PAGO_SUBSCRIPTION_STATUS.paused:
      return {
        isAttachedToProviderPlan: true,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused,
        statusReason:
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive,
      };
    case MERCADO_PAGO_SUBSCRIPTION_STATUS.pending:
    default:
      return {
        isAttachedToProviderPlan: true,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
        statusReason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
      };
  }
}
