/**
 * Integrates subscription operations with Mercado Pago HTTP APIs.
 *
 * @module mercado-pago-subscription-gateway
 */

import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";

const MERCADO_PAGO_ENV = {
  clientId: "MERCADO_PAGO_CLIENT_ID",
  clientSecret: "MERCADO_PAGO_CLIENT_SECRET",
} as const;

const MERCADO_PAGO_URL = {
  apiBase: "https://api.mercadopago.com",
  authorization: "https://auth.mercadopago.com.ar/authorization",
  oauthToken: "https://api.mercadopago.com/oauth/token",
  preapproval: "https://api.mercadopago.com/preapproval",
  preapprovalPlan: "https://api.mercadopago.com/preapproval_plan",
} as const;

const MERCADO_PAGO_HTTP = {
  authorizationHeader: "Authorization",
  bearerPrefix: "Bearer ",
  contentTypeHeader: "Content-Type",
  getMethod: "GET",
  idempotencyHeader: "X-Idempotency-Key",
  jsonContentType: "application/json",
  postMethod: "POST",
} as const;

export type MercadoPagoPlanInput = {
  accessToken: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  name: string;
  reason: string;
};

export type MercadoPagoSubscriptionInput = {
  accessToken: string;
  backUrl: string;
  idempotencyKey: string;
  payerEmail: string;
  preapprovalPlanId: string;
  reason: string;
};

export type MercadoPagoPreapprovalStatusInput = {
  accessToken: string;
  preapprovalId: string;
};

export type MercadoPagoOAuthTokenResult = {
  accessToken: string;
  expiresIn: number | null;
  providerAccountId: string | null;
  refreshToken: string | null;
};

type MercadoPagoPlanResponse = {
  id?: string;
};

type MercadoPagoSubscriptionResponse = {
  id?: string;
  init_point?: string;
};

type MercadoPagoPreapprovalResponse = {
  status?: string;
};

type MercadoPagoOAuthResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  user_id?: number | string;
};

/**
 * Reads a required Mercado Pago environment value.
 *
 * @param name - Environment variable name.
 * @returns Configured environment value.
 * @throws When the required Mercado Pago variable is missing.
 */
function readRequiredMercadoPagoEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(name + " is required for Mercado Pago integration");
  }

  return value;
}

/**
 * Parses a provider JSON response and validates HTTP success.
 *
 * @param response - Fetch response returned by Mercado Pago.
 * @returns Parsed JSON body.
 * @throws When Mercado Pago returns a non-successful response.
 */
async function readMercadoPagoResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error("Mercado Pago request failed with status " + response.status);
  }

  return body;
}

/**
 * Builds the OAuth authorization URL for a tribe connection request.
 *
 * @param state - Opaque state value that binds callback handling to a tribe.
 * @returns Mercado Pago authorization URL.
 */
export function buildMercadoPagoAuthorizationUrl(state: string): string {
  const authorizationUrl = new URL(MERCADO_PAGO_URL.authorization);

  authorizationUrl.searchParams.set(
    "client_id",
    readRequiredMercadoPagoEnvironment(MERCADO_PAGO_ENV.clientId)
  );
  authorizationUrl.searchParams.set(
    "redirect_uri",
    resolvePublicAppBaseUrl() + "/api/mercado-pago/oauth/callback"
  );
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("platform_id", "mp");
  authorizationUrl.searchParams.set("state", state);

  return authorizationUrl.toString();
}

/**
 * Exchanges an OAuth authorization code for Mercado Pago account tokens.
 *
 * @param code - Authorization code received in the callback.
 * @returns Token payload required to persist the integration.
 */
export async function exchangeMercadoPagoAuthorizationCode(
  code: string
): Promise<MercadoPagoOAuthTokenResult> {
  const response = await fetch(MERCADO_PAGO_URL.oauthToken, {
    body: JSON.stringify({
      client_id: readRequiredMercadoPagoEnvironment(MERCADO_PAGO_ENV.clientId),
      client_secret: readRequiredMercadoPagoEnvironment(
        MERCADO_PAGO_ENV.clientSecret
      ),
      code,
      grant_type: "authorization_code",
      redirect_uri:
        resolvePublicAppBaseUrl() + "/api/mercado-pago/oauth/callback",
    }),
    headers: {
      [MERCADO_PAGO_HTTP.contentTypeHeader]: MERCADO_PAGO_HTTP.jsonContentType,
    },
    method: MERCADO_PAGO_HTTP.postMethod,
  });
  const body = await readMercadoPagoResponse<MercadoPagoOAuthResponse>(response);

  if (!body.access_token) {
    throw new Error("Mercado Pago OAuth response did not include access_token");
  }

  return {
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : null,
    providerAccountId:
      body.user_id === undefined || body.user_id === null
        ? null
        : String(body.user_id),
    refreshToken: body.refresh_token ?? null,
  };
}

/**
 * Refreshes an expired Mercado Pago account token.
 *
 * @param refreshToken - Refresh token persisted for the tribe integration.
 * @returns Fresh token payload required to keep the integration usable.
 */
export async function refreshMercadoPagoAccessToken(
  refreshToken: string
): Promise<MercadoPagoOAuthTokenResult> {
  const response = await fetch(MERCADO_PAGO_URL.oauthToken, {
    body: JSON.stringify({
      client_id: readRequiredMercadoPagoEnvironment(MERCADO_PAGO_ENV.clientId),
      client_secret: readRequiredMercadoPagoEnvironment(
        MERCADO_PAGO_ENV.clientSecret
      ),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: {
      [MERCADO_PAGO_HTTP.contentTypeHeader]: MERCADO_PAGO_HTTP.jsonContentType,
    },
    method: MERCADO_PAGO_HTTP.postMethod,
  });
  const body = await readMercadoPagoResponse<MercadoPagoOAuthResponse>(response);

  if (!body.access_token) {
    throw new Error("Mercado Pago refresh response did not include access_token");
  }

  return {
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : null,
    providerAccountId:
      body.user_id === undefined || body.user_id === null
        ? null
        : String(body.user_id),
    refreshToken: body.refresh_token ?? null,
  };
}

/**
 * Creates a Mercado Pago subscription plan.
 *
 * @param input - Plan data and account token.
 * @returns Mercado Pago preapproval plan identifier.
 */
export async function createMercadoPagoPreapprovalPlan(
  input: MercadoPagoPlanInput
): Promise<string> {
  const response = await fetch(MERCADO_PAGO_URL.preapprovalPlan, {
    body: JSON.stringify({
      auto_recurring: {
        currency_id: input.currency,
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.amountCents / 100,
      },
      back_url: resolvePublicAppBaseUrl(),
      reason: input.reason,
    }),
    headers: {
      [MERCADO_PAGO_HTTP.authorizationHeader]:
        MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      [MERCADO_PAGO_HTTP.contentTypeHeader]: MERCADO_PAGO_HTTP.jsonContentType,
      [MERCADO_PAGO_HTTP.idempotencyHeader]: input.idempotencyKey,
    },
    method: MERCADO_PAGO_HTTP.postMethod,
  });
  const body = await readMercadoPagoResponse<MercadoPagoPlanResponse>(response);

  if (!body.id) {
    throw new Error("Mercado Pago preapproval plan response did not include id");
  }

  return body.id;
}

/**
 * Creates a Mercado Pago member subscription from a current price plan.
 *
 * @param input - Subscription data and account token.
 * @returns Provider subscription identifier and checkout URL.
 */
export async function createMercadoPagoPreapprovalSubscription(
  input: MercadoPagoSubscriptionInput
) {
  const response = await fetch(MERCADO_PAGO_URL.preapproval, {
    body: JSON.stringify({
      back_url: input.backUrl,
      payer_email: input.payerEmail,
      preapproval_plan_id: input.preapprovalPlanId,
      reason: input.reason,
    }),
    headers: {
      [MERCADO_PAGO_HTTP.authorizationHeader]:
        MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      [MERCADO_PAGO_HTTP.contentTypeHeader]: MERCADO_PAGO_HTTP.jsonContentType,
      [MERCADO_PAGO_HTTP.idempotencyHeader]: input.idempotencyKey,
    },
    method: MERCADO_PAGO_HTTP.postMethod,
  });
  const body =
    await readMercadoPagoResponse<MercadoPagoSubscriptionResponse>(response);

  if (!body.id || !body.init_point) {
    throw new Error(
      "Mercado Pago preapproval response did not include id or init_point"
    );
  }

  return {
    checkoutUrl: body.init_point,
    providerSubscriptionId: body.id,
  };
}

/**
 * Reads the current Mercado Pago preapproval status from the provider.
 *
 * @param input - Provider subscription identifier and account token.
 * @returns Provider status value.
 */
export async function getMercadoPagoPreapprovalStatus(
  input: MercadoPagoPreapprovalStatusInput
): Promise<string> {
  const response = await fetch(
    `${MERCADO_PAGO_URL.preapproval}/${input.preapprovalId}`,
    {
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      },
      method: MERCADO_PAGO_HTTP.getMethod,
    }
  );
  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalResponse>(
    response
  );

  if (!body.status) {
    throw new Error("Mercado Pago preapproval response did not include status");
  }

  return body.status;
}
