/**
 * Mercado Pago endpoints shared by the provider gateway and its development mock.
 *
 * @module mercado-pago
 */

/** Development-only variable that picks the simulated checkout outcome (`authorized` or `pending`). */
export const MERCADO_PAGO_MOCK_CHECKOUT_STATUS_ENVIRONMENT_VARIABLE =
  "MOCK_MERCADO_PAGO_CHECKOUT_STATUS";

/** Mercado Pago API and OAuth endpoints used by the subscriptions module. */
export const MERCADO_PAGO_URL = {
  apiBase: "https://api.mercadopago.com",
  authorizedPayments: "https://api.mercadopago.com/authorized_payments",
  authorization: "https://auth.mercadopago.com.ar/authorization",
  oauthToken: "https://api.mercadopago.com/oauth/token",
  payments: "https://api.mercadopago.com/v1/payments",
  preapproval: "https://api.mercadopago.com/preapproval",
  preapprovalPlan: "https://api.mercadopago.com/preapproval_plan",
} as const;
