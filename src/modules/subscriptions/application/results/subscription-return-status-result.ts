/**
 * Provides the application result of the Mercado Pago return status check.
 *
 * @module subscription-return-status-result
 */

/**
 * Status of a Mercado Pago subscription return as seen by the browser that
 * waits on the return screen: keep waiting, or navigate to an internal path
 * (welcome page, subscription page, or the tribe page itself when the return
 * cannot be confirmed and the page owns the final screen).
 */
export type SubscriptionReturnStatusResult =
  | { status: "pending" }
  | { redirectPath: string; status: "resolved" };
