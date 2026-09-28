/**
 * Builds the Mercado Pago return path of a tribe (`/<slug>?preapproval_id=...`),
 * the page that confirms a subscription after checkout. Shared by the tribe
 * page (sign-in callback and external-browser handoff), the return status
 * route (fallback destination) and the browser polling adapter.
 *
 * @module subscription-return-path
 */

import { ROUTES } from "@/src/constants/routes";
import { SUBSCRIPTION_RETURN_QUERY_PARAM } from "@/src/modules/subscriptions/constants/subscription-return-status";

const QUERY_SEPARATOR = "?";
const QUERY_VALUE_SEPARATOR = "=";

/**
 * Builds the internal return path for a Mercado Pago preapproval.
 *
 * @param tribeSlug - Slug of the tribe the member subscribed to.
 * @param mercadoPagoPreapprovalId - Preapproval id appended by Mercado Pago.
 * @returns Same-origin path of the tribe page with the encoded preapproval id.
 */
export function buildSubscriptionReturnPath(
  tribeSlug: string,
  mercadoPagoPreapprovalId: string
): string {
  return (
    ROUTES.tribes.bySlug(tribeSlug) +
    QUERY_SEPARATOR +
    SUBSCRIPTION_RETURN_QUERY_PARAM.mercadoPagoPreapprovalId +
    QUERY_VALUE_SEPARATOR +
    encodeURIComponent(mercadoPagoPreapprovalId)
  );
}
