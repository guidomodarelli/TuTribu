/**
 * Provides the contract values of the Mercado Pago subscription return status
 * check: the query parameter Mercado Pago appends to the return URL, the
 * accepted shape of that provider id, the public status values and the input
 * issue categories of the status endpoint.
 *
 * @module subscription-return-status-constants
 */

/**
 * Query parameter that carries the Mercado Pago preapproval id on the return
 * URL (`/<slug>?preapproval_id=...`) and on the status endpoint.
 */
export const SUBSCRIPTION_RETURN_QUERY_PARAM = {
  mercadoPagoPreapprovalId: "preapproval_id",
} as const;

/**
 * Upper bound for a Mercado Pago preapproval id accepted from the browser.
 * Real ids are short hexadecimal strings; the bound only rejects junk input.
 */
export const MERCADO_PAGO_PREAPPROVAL_ID_MAX_LENGTH = 128;

/**
 * Characters accepted in a Mercado Pago preapproval id coming from the
 * browser. Provider ids are alphanumeric; `-` and `_` are tolerated.
 */
export const MERCADO_PAGO_PREAPPROVAL_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Public statuses of the return status check: `pending` keeps the browser
 * polling and `resolved` carries the internal path it must navigate to.
 */
export const SUBSCRIPTION_RETURN_STATUS = {
  pending: "pending",
  resolved: "resolved",
} as const;

/**
 * Stable categories of rejected status-check input, translated to Spanish
 * copy at the route boundary.
 */
export const SUBSCRIPTION_RETURN_INPUT_ISSUE = {
  invalidReturn: "invalid_subscription_return",
} as const;
