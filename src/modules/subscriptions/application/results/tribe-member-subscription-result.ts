/**
 * Provides application result contracts for member subscription workflows.
 *
 * @module tribe-member-subscription-result
 */

import type { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";

export type TribeMemberSubscriptionStartResult =
  | {
      checkoutUrl: string;
      status: typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending;
    }
  | {
      status:
        | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked
        | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.invalidInvitation
        | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice
        | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked;
    };

export type TribeMemberSubscriptionWebhookResult = {
  status:
    | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook
    | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed;
};
