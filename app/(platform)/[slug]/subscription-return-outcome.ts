/**
 * Decides what a Mercado Pago subscription return leads to. Shared by the
 * tribe page (first render after the provider redirect) and the return status
 * route (browser polling), so both apply the same authorization and the same
 * mapping from the local subscription status to a destination.
 *
 * @module subscription-return-outcome
 */

import { ROUTES } from "@/src/constants/routes";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import {
  TRIBE_MEMBERSHIP_STATUS_REASON,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
  type TribePageAccessResult,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;

/**
 * Membership reasons that a paid subscription can recover: a failed payment
 * (`payment_blocked`) or a subscription that became inactive. Conduct blocks
 * (and any other reason) never reach the return resolution.
 */
const SUBSCRIPTION_RETURN_RECOVERABLE_REASONS: ReadonlySet<string> = new Set([
  TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked,
  TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive,
]);

/**
 * Local statuses that keep the member on the "confirming" screen while the
 * Mercado Pago webhook (or the next reconciliation) settles the subscription.
 */
const SUBSCRIPTION_RETURN_WAITING_STATUSES: ReadonlySet<string> = new Set([
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.removedBySubscription,
]);

export const SUBSCRIPTION_RETURN_OUTCOME = {
  failed: "failed",
  pending: "pending",
  redirect: "redirect",
  unresolved: "unresolved",
} as const;

export type SubscriptionReturnOutcome =
  | { kind: "failed"; error: unknown }
  | { kind: "pending" }
  | { kind: "redirect"; path: string }
  | { kind: "unresolved" };

/**
 * Tells whether a hidden tribe access can still be recovered by a Mercado
 * Pago return (or by re-subscribing through the open-join offer).
 *
 * @param accessResult - Tribe page access of the viewer.
 * @returns Whether the access is a payment-related block.
 */
export function isSubscriptionRecoverableAccess(
  accessResult: TribePageAccessResult
): boolean {
  return (
    accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden &&
    accessResult.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden &&
    SUBSCRIPTION_RETURN_RECOVERABLE_REASONS.has(accessResult.blockedReason)
  );
}

function mapSubscriptionReturnStatus(
  status: string | null,
  tribeSlug: string
): SubscriptionReturnOutcome {
  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.active) {
    return {
      kind: SUBSCRIPTION_RETURN_OUTCOME.redirect,
      path: ROUTES.tribes.welcome(tribeSlug),
    };
  }

  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused) {
    return {
      kind: SUBSCRIPTION_RETURN_OUTCOME.redirect,
      path: ROUTES.tribes.subscription(tribeSlug),
    };
  }

  if (status !== null && SUBSCRIPTION_RETURN_WAITING_STATUSES.has(status)) {
    return { kind: SUBSCRIPTION_RETURN_OUTCOME.pending };
  }

  return { kind: SUBSCRIPTION_RETURN_OUTCOME.unresolved };
}

/**
 * Resolves a Mercado Pago return for a payment-blocked member. The browser
 * return is never the access source: the use case only reads (or repairs the
 * linkage of) the local subscription, and access changes come from the
 * provider webhook or the throttled reconciliation.
 *
 * Only a rejection of the resolution use case becomes `failed`, so each
 * caller decides its own safe fallback; composition errors propagate.
 *
 * @param input - Request modules, request id, tribe slug and preapproval id.
 * @returns Destination, waiting state, unresolved return, or failure.
 */
export async function resolveSubscriptionReturnOutcome(input: {
  modules: RequestModules;
  providerSubscriptionId: string;
  requestId: string;
  tribeSlug: string;
}): Promise<SubscriptionReturnOutcome> {
  const subscriptionConfirmationModules = await createRequestModules({
    mercadoPagoWebhookVerified: true,
    requestId: input.requestId,
  });
  const resolveSubscriptionReturn =
    subscriptionConfirmationModules.subscriptions.useCases
      .resolveTribeMemberSubscriptionReturn;
  const query = {
    providerSubscriptionId: input.providerSubscriptionId,
    tribeSlug: input.tribeSlug,
  };

  if (!resolveSubscriptionReturn) {
    const hasPendingReturn =
      await input.modules.subscriptions.useCases.validatePendingTribeMemberSubscriptionReturn(
        query
      );

    return hasPendingReturn
      ? { kind: SUBSCRIPTION_RETURN_OUTCOME.pending }
      : { kind: SUBSCRIPTION_RETURN_OUTCOME.unresolved };
  }

  try {
    const subscriptionReturn = await resolveSubscriptionReturn(query);

    return mapSubscriptionReturnStatus(
      subscriptionReturn?.status ?? null,
      input.tribeSlug
    );
  } catch (error) {
    return { error, kind: SUBSCRIPTION_RETURN_OUTCOME.failed };
  }
}
