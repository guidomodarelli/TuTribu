/**
 * Failure answers shared by the subscription route handlers that talk to the
 * Mercado Pago integration (plan and subscriber verification, diagnostics).
 *
 * @module provider-sync-route-responses
 */

import { createStatusMessageResponse } from "@/app/api/member-route-scope";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { HTTP_STATUS } from "@/app/api/route-http-status";

/** Spanish copy of the provider sync failures of one route. */
export type ProviderSyncFailureCopy = {
  forbiddenMessage: string;
  missingIntegrationMessage: string;
  notFoundMessage: string;
};

/**
 * Answers a failed provider sync: 503 while Mercado Pago is not connected or
 * still needs setup, 404 when the target is missing, 403 otherwise.
 *
 * @param status - Failure status of the use case.
 * @param copy - Spanish copy of the route.
 * @returns The JSON response.
 */
export function createProviderSyncFailureResponse(
  status: string,
  copy: ProviderSyncFailureCopy
): Response {
  const missingIntegration = {
    message: copy.missingIntegrationMessage,
    status: HTTP_STATUS.serviceUnavailable,
  };

  return createStatusMessageResponse(
    status,
    {
      [TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration]: missingIntegration,
      [TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound]: {
        message: copy.notFoundMessage,
        status: HTTP_STATUS.notFound,
      },
      [TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired]: missingIntegration,
    },
    { message: copy.forbiddenMessage, status: HTTP_STATUS.forbidden }
  );
}
