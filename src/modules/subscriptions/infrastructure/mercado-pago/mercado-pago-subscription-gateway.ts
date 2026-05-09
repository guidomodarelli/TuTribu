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
  putMethod: "PUT",
} as const;

const MERCADO_PAGO_ERROR_DETAIL = {
  maxCauseCount: 3,
  maxTextLength: 240,
} as const;

const MERCADO_PAGO_SENSITIVE_TEXT_PATTERNS = [
  /\b(?:APP_USR|TEST)-[A-Za-z0-9._-]+/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
] as const;

export type MercadoPagoPlanInput = {
  accessToken: string;
  amountCents: number;
  currency: string;
  externalReference: string;
  idempotencyKey: string;
  name: string;
  reason: string;
};

export type MercadoPagoPlanUpdateInput = {
  accessToken: string;
  externalReference: string;
  preapprovalPlanId: string;
  reason: string;
  status: string;
};

export type MercadoPagoSubscriptionInput = {
  accessToken: string;
  amountCents: number;
  backUrl: string;
  currency: string;
  externalReference: string;
  idempotencyKey: string;
  payerEmail: string;
  reason: string;
};

export type MercadoPagoPreapprovalStatusInput = {
  accessToken: string;
  preapprovalId: string;
};

export type MercadoPagoPreapprovalPlanStatusInput = {
  accessToken: string;
  preapprovalPlanId: string;
};

export type MercadoPagoPreapprovalPlanInput = {
  accessToken: string;
  preapprovalPlanId: string;
};

export type MercadoPagoPreapprovalPlanSearchInput = {
  accessToken: string;
  externalReference: string;
};

export type MercadoPagoPreapprovalPlanResult = {
  amountCents: number | null;
  currency: string | null;
  externalReference: string | null;
  id: string;
  reason: string | null;
  status: string;
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

type MercadoPagoPreapprovalPlanResponse = {
  auto_recurring?: {
    currency_id?: string;
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
  };
  external_reference?: string | number | null;
  id?: string;
  reason?: string | null;
  status?: string;
};

type MercadoPagoPreapprovalPlanSearchResponse = {
  results?: MercadoPagoPreapprovalPlanResponse[];
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

type MercadoPagoErrorBody = {
  cause?: unknown;
  error?: unknown;
  message?: unknown;
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
 * Redacts sensitive provider values before they can reach application logs.
 *
 * @param value - Provider text that may include tokens or PII.
 * @returns Safe text for diagnostics.
 */
function redactMercadoPagoDiagnosticText(value: string): string {
  return MERCADO_PAGO_SENSITIVE_TEXT_PATTERNS.reduce(
    (safeValue, pattern) => safeValue.replace(pattern, "[redacted]"),
    value
  );
}

/**
 * Converts simple provider values to bounded safe diagnostic text.
 *
 * @param value - Unknown value returned by Mercado Pago.
 * @returns Safe diagnostic text, or null when the value is not useful.
 */
function toSafeMercadoPagoDiagnosticText(value: unknown): string | null {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return null;
  }

  const safeText = redactMercadoPagoDiagnosticText(String(value)).trim();

  return safeText
    ? safeText.slice(0, MERCADO_PAGO_ERROR_DETAIL.maxTextLength)
    : null;
}

/**
 * Builds bounded cause details from a Mercado Pago error body.
 *
 * @param cause - Provider cause payload.
 * @returns Safe cause details for diagnostics.
 */
function buildMercadoPagoCauseDetails(cause: unknown): string[] {
  if (!Array.isArray(cause)) {
    return [];
  }

  return cause
    .slice(0, MERCADO_PAGO_ERROR_DETAIL.maxCauseCount)
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return toSafeMercadoPagoDiagnosticText(entry);
      }

      const details = entry as Record<string, unknown>;
      const code = toSafeMercadoPagoDiagnosticText(details.code);
      const description = toSafeMercadoPagoDiagnosticText(details.description);

      return [code, description].filter(Boolean).join(": ") || null;
    })
    .filter((detail): detail is string => Boolean(detail));
}

/**
 * Builds the public error message for failed Mercado Pago requests.
 *
 * @param status - HTTP status returned by Mercado Pago.
 * @param body - Parsed provider response body.
 * @returns Error message with safe provider diagnostics.
 */
function buildMercadoPagoRequestFailureMessage(
  status: number,
  body: unknown
): string {
  const baseMessage = "Mercado Pago request failed with status " + status;
  if (!body || typeof body !== "object") {
    return baseMessage;
  }

  const errorBody = body as MercadoPagoErrorBody;
  const providerDetails = [
    toSafeMercadoPagoDiagnosticText(errorBody.message),
    toSafeMercadoPagoDiagnosticText(errorBody.error),
    ...buildMercadoPagoCauseDetails(errorBody.cause),
  ].filter((detail): detail is string => Boolean(detail));

  return providerDetails.length
    ? baseMessage + ": " + providerDetails.join("; ")
    : baseMessage;
}

/**
 * Maps a Mercado Pago preapproval plan response into the internal provider result.
 *
 * @param body - Provider plan response body.
 * @param fallbackPlanId - Plan identifier used when the provider body omits the id.
 * @returns Normalized provider plan result.
 * @throws When Mercado Pago omits the required plan status.
 */
function mapMercadoPagoPreapprovalPlanResponse(
  body: MercadoPagoPreapprovalPlanResponse,
  fallbackPlanId: string
): MercadoPagoPreapprovalPlanResult {
  if (!body.status) {
    throw new Error(
      "Mercado Pago preapproval plan response did not include status"
    );
  }

  return {
    amountCents:
      typeof body.auto_recurring?.transaction_amount === "number"
        ? Math.round(body.auto_recurring.transaction_amount * 100)
        : null,
    currency: body.auto_recurring?.currency_id ?? null,
    externalReference:
      body.external_reference === undefined || body.external_reference === null
        ? null
        : String(body.external_reference),
    id: body.id ?? fallbackPlanId,
    reason: body.reason ?? null,
    status: body.status,
  };
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
    throw new Error(
      buildMercadoPagoRequestFailureMessage(response.status, body)
    );
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
      external_reference: input.externalReference,
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
 * Updates mutable Mercado Pago subscription plan fields.
 *
 * @param input - Provider plan identifier, account token, and mutable plan data.
 * @returns Updated Mercado Pago plan details.
 */
export async function updateMercadoPagoPreapprovalPlan(
  input: MercadoPagoPlanUpdateInput
): Promise<MercadoPagoPreapprovalPlanResult> {
  const response = await fetch(
    `${MERCADO_PAGO_URL.preapprovalPlan}/${input.preapprovalPlanId}`,
    {
      body: JSON.stringify({
        external_reference: input.externalReference,
        reason: input.reason,
        status: input.status,
      }),
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
        [MERCADO_PAGO_HTTP.contentTypeHeader]:
          MERCADO_PAGO_HTTP.jsonContentType,
      },
      method: MERCADO_PAGO_HTTP.putMethod,
    }
  );
  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalPlanResponse>(
    response
  );

  return mapMercadoPagoPreapprovalPlanResponse(body, input.preapprovalPlanId);
}

/**
 * Reads full Mercado Pago preapproval plan details from the provider.
 *
 * @param input - Provider plan identifier and account token.
 * @returns Normalized provider plan details, or null when the plan does not exist.
 */
export async function getMercadoPagoPreapprovalPlan(
  input: MercadoPagoPreapprovalPlanInput
): Promise<MercadoPagoPreapprovalPlanResult | null> {
  const response = await fetch(
    `${MERCADO_PAGO_URL.preapprovalPlan}/${input.preapprovalPlanId}`,
    {
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      },
      method: MERCADO_PAGO_HTTP.getMethod,
    }
  );

  if (response.status === 404) {
    return null;
  }

  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalPlanResponse>(
    response
  );

  return mapMercadoPagoPreapprovalPlanResponse(body, input.preapprovalPlanId);
}

/**
 * Searches Mercado Pago preapproval plans by external reference.
 *
 * @param input - Provider account token and external reference to match.
 * @returns Linked provider plans returned by Mercado Pago.
 */
export async function searchMercadoPagoPreapprovalPlans(
  input: MercadoPagoPreapprovalPlanSearchInput
): Promise<MercadoPagoPreapprovalPlanResult[]> {
  const searchUrl = new URL(`${MERCADO_PAGO_URL.preapprovalPlan}/search`);

  searchUrl.searchParams.set("external_reference", input.externalReference);

  const response = await fetch(searchUrl.toString(), {
    headers: {
      [MERCADO_PAGO_HTTP.authorizationHeader]:
        MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
    },
    method: MERCADO_PAGO_HTTP.getMethod,
  });
  const body =
    await readMercadoPagoResponse<MercadoPagoPreapprovalPlanSearchResponse>(
      response
    );

  return (body.results ?? []).map((plan) =>
    mapMercadoPagoPreapprovalPlanResponse(plan, plan.id ?? "")
  );
}

/**
 * Reads the current Mercado Pago preapproval plan status from the provider.
 *
 * @param input - Provider plan identifier and account token.
 * @returns Provider plan status value, or null when the plan does not exist.
 */
export async function getMercadoPagoPreapprovalPlanStatus(
  input: MercadoPagoPreapprovalPlanStatusInput
): Promise<string | null> {
  const response = await fetch(
    `${MERCADO_PAGO_URL.preapprovalPlan}/${input.preapprovalPlanId}`,
    {
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      },
      method: MERCADO_PAGO_HTTP.getMethod,
    }
  );

  if (response.status === 404) {
    return null;
  }

  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalPlanResponse>(
    response
  );

  if (!body.status) {
    throw new Error(
      "Mercado Pago preapproval plan response did not include status"
    );
  }

  return body.status;
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
      auto_recurring: {
        currency_id: input.currency,
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.amountCents / 100,
      },
      back_url: input.backUrl,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      reason: input.reason,
      status: "pending",
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
