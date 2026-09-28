/**
 * Browser adapter of `GET /api/tribes/[slug]/subscriptions/return-status`.
 * It only knows the URL and the response contract: a success body is checked
 * with `safeParse` against the public DTO schema (which only admits
 * same-origin paths), and every other outcome becomes a typed result. It
 * never throws, so the polling hook only decides timing and navigation.
 *
 * @module subscription-return-status-api-client
 */

import { ROUTES } from "@/src/constants/routes";
import { subscriptionReturnStatusSchema } from "@/src/modules/subscriptions/application/results/subscription-return-status-public-dto-schemas";
import {
  SUBSCRIPTION_RETURN_QUERY_PARAM,
  SUBSCRIPTION_RETURN_STATUS,
} from "@/src/modules/subscriptions/constants/subscription-return-status";

export const SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT = {
  failed: "failed",
  pending: "pending",
  reauthenticate: "reauthenticate",
  resolved: "resolved",
} as const;

export type SubscriptionReturnStatusRequestResult =
  | { kind: "failed" }
  | { kind: "pending" }
  | { kind: "reauthenticate" }
  | { kind: "resolved"; redirectPath: string };

const SUBSCRIPTION_RETURN_STATUS_ENDPOINT = {
  path: "/subscriptions/return-status",
  querySeparator: "?",
  separator: "/",
  valueSeparator: "=",
} as const;

const HTTP_UNAUTHORIZED_STATUS = 401;
const NO_STORE_CACHE: RequestCache = "no-store";

function buildSubscriptionReturnStatusUrl(
  tribeSlug: string,
  providerSubscriptionId: string
): string {
  return (
    ROUTES.api.tribes +
    SUBSCRIPTION_RETURN_STATUS_ENDPOINT.separator +
    encodeURIComponent(tribeSlug) +
    SUBSCRIPTION_RETURN_STATUS_ENDPOINT.path +
    SUBSCRIPTION_RETURN_STATUS_ENDPOINT.querySeparator +
    SUBSCRIPTION_RETURN_QUERY_PARAM.mercadoPagoPreapprovalId +
    SUBSCRIPTION_RETURN_STATUS_ENDPOINT.valueSeparator +
    encodeURIComponent(providerSubscriptionId)
  );
}

/**
 * Asks the server whether a Mercado Pago return is still pending.
 *
 * @param input - Tribe slug, preapproval id and the abort signal of the poll.
 * @returns Pending, resolved destination, lost session, or failure.
 */
export async function fetchSubscriptionReturnStatusRequest(input: {
  providerSubscriptionId: string;
  signal: AbortSignal;
  tribeSlug: string;
}): Promise<SubscriptionReturnStatusRequestResult> {
  let response: Response;

  try {
    response = await fetch(
      buildSubscriptionReturnStatusUrl(
        input.tribeSlug,
        input.providerSubscriptionId
      ),
      { cache: NO_STORE_CACHE, signal: input.signal }
    );
  } catch {
    // Network failures and aborted polls are expected: the caller backs off
    // (or already stopped, when the signal was aborted).
    return { kind: SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.failed };
  }

  if (response.status === HTTP_UNAUTHORIZED_STATUS) {
    return { kind: SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.reauthenticate };
  }

  if (!response.ok) {
    return { kind: SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.failed };
  }

  const body: unknown = await response.json().catch(() => null);
  const dto = subscriptionReturnStatusSchema.safeParse(body);

  if (!dto.success) {
    return { kind: SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.failed };
  }

  if (dto.data.status === SUBSCRIPTION_RETURN_STATUS.resolved) {
    return {
      kind: SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.resolved,
      redirectPath: dto.data.redirectPath,
    };
  }

  return { kind: SUBSCRIPTION_RETURN_STATUS_REQUEST_RESULT.pending };
}
