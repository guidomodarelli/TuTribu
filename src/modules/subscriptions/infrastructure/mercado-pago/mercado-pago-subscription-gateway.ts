/**
 * Integrates subscription operations with Mercado Pago HTTP APIs.
 *
 * @module mercado-pago-subscription-gateway
 */

import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import {
  fetchWithResilience,
  FETCH_LIFECYCLE_EVENT,
  type FetchLifecycleLogger,
  type HttpFetcher,
  type HttpResponse,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";
import { SERVER_LOG_LEVEL } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  TRIBE_SUBSCRIPTION_FREQUENCY,
  TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE,
} from "@/src/modules/subscriptions/constants/subscriptions";
import {
  logPaymentOperation,
  type PaymentOperationTraceContext,
} from "@/src/modules/subscriptions/infrastructure/observability/payment-operation-logger";

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

const MERCADO_PAGO_RESPONSE_ERROR_MESSAGE = {
  preapprovalMissingStatus:
    "Mercado Pago preapproval response did not include status",
} as const;

const HTTP_STATUS_NOT_FOUND = 404;

const CENTS_PER_CURRENCY_UNIT = 100;

const MERCADO_PAGO_FETCH_RESILIENCE = {
  maxRetries: 1,
  retryDelayMs: 100,
  timeoutMs: 5000,
} as const;

const MERCADO_PAGO_PAYMENT_OPERATION = {
  createPreapprovalPlan: "create-mercado-pago-preapproval-plan",
  createPreapprovalSubscription: "create-mercado-pago-preapproval-subscription",
  exchangeOAuthCode: "exchange-mercado-pago-oauth-code",
  getPreapprovalDetails: "get-mercado-pago-preapproval-details",
  getPreapprovalPlan: "get-mercado-pago-preapproval-plan",
  getPreapprovalPlanStatus: "get-mercado-pago-preapproval-plan-status",
  getPreapprovalStatus: "get-mercado-pago-preapproval-status",
  refreshAccessToken: "refresh-mercado-pago-access-token",
  searchPreapprovalPlans: "search-mercado-pago-preapproval-plans",
  updatePreapprovalBackUrl: "update-mercado-pago-preapproval-back-url",
  updatePreapprovalPlan: "update-mercado-pago-preapproval-plan",
  updatePreapprovalSubscriptionStatus:
    "update-mercado-pago-preapproval-subscription-status",
} as const;

const MERCADO_PAGO_PAYMENT_OPERATION_LOG = {
  completedMessage: "Mercado Pago payment operation completed",
  failedMessage: "Mercado Pago payment operation failed",
  lifecycleMessage: "Mercado Pago payment operation lifecycle event",
} as const;

const MERCADO_PAGO_PAYMENT_OPERATION_RESULT = {
  invalidProviderResponse: "invalid_provider_response",
  notFound: "not_found",
  providerRejected: "provider_rejected",
  requestAttempted: "request_attempted",
  requestFailed: "request_failed",
  retryScheduled: "retry_scheduled",
  success: "success",
  timeoutAbort: "timeout_abort",
} as const;

const MERCADO_PAGO_SENSITIVE_TEXT_PATTERNS = [
  /\b(?:APP_USR|TEST)-[A-Za-z0-9._-]+/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
] as const;

export type MercadoPagoPlanInput = {
  accessToken: string;
  amountCents: number;
  backUrl: string;
  currency: string;
  externalReference: string;
  idempotencyKey: string;
  name: string;
  reason: string;
  traceContext?: PaymentOperationTraceContext;
  trialFrequency?: number | null;
  trialFrequencyType?: "days" | "months" | null;
};

export type MercadoPagoPlanUpdateInput = {
  accessToken: string;
  amountCents: number;
  backUrl: string;
  currency: string;
  externalReference: string;
  frequency: string;
  preapprovalPlanId: string;
  reason: string;
  status: string;
  traceContext?: PaymentOperationTraceContext;
  trialFrequency?: number | null;
  trialFrequencyType?: "days" | "months" | null;
};

export type MercadoPagoSubscriptionInput = {
  accessToken: string;
  amountCents: number;
  backUrl: string;
  currency: string;
  externalReference: string;
  idempotencyKey: string;
  payerEmail: string;
  preapprovalPlanId: string;
  reason: string;
  traceContext?: PaymentOperationTraceContext;
};

export type MercadoPagoPreapprovalStatusInput = {
  accessToken: string;
  preapprovalId: string;
  traceContext?: PaymentOperationTraceContext;
};

export type MercadoPagoPreapprovalBackUrlUpdateInput = {
  accessToken: string;
  backUrl: string;
  preapprovalId: string;
  traceContext?: PaymentOperationTraceContext;
};

export type MercadoPagoPreapprovalDetailsInput = {
  accessToken: string;
  preapprovalId: string;
  traceContext?: PaymentOperationTraceContext;
};

export type MercadoPagoPreapprovalDetailsResult = {
  externalReference: string | null;
  id: string;
  preapprovalPlanId: string | null;
  status: string;
};

export type MercadoPagoPreapprovalPlanStatusInput = {
  accessToken: string;
  preapprovalPlanId: string;
  traceContext?: PaymentOperationTraceContext;
};

export type MercadoPagoPreapprovalPlanInput = {
  accessToken: string;
  preapprovalPlanId: string;
  traceContext?: PaymentOperationTraceContext;
};

export type MercadoPagoPreapprovalPlanSearchInput = {
  accessToken: string;
  externalReference: string;
  traceContext?: PaymentOperationTraceContext;
};

export type MercadoPagoPreapprovalPlanResult = {
  amountCents: number | null;
  currency: string | null;
  externalReference: string | null;
  id: string;
  reason: string | null;
  status: string;
  trial: {
    frequency: number;
    frequencyType: "days" | "months";
  } | null;
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
    free_trial?: {
      frequency?: number;
      frequency_type?: string;
    } | null;
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
  external_reference?: string | number | null;
  id?: string;
  preapproval_plan_id?: string | null;
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

  return cause.reduce<string[]>((detailsList, entry, entryIndex) => {
    if (entryIndex >= MERCADO_PAGO_ERROR_DETAIL.maxCauseCount) {
      return detailsList;
    }

      if (!entry || typeof entry !== "object") {
        const safeDetail = toSafeMercadoPagoDiagnosticText(entry);

        if (safeDetail) {
          detailsList.push(safeDetail);
        }

        return detailsList;
      }

      const details = entry as Record<string, unknown>;
      const code = toSafeMercadoPagoDiagnosticText(details.code);
      const description = toSafeMercadoPagoDiagnosticText(details.description);
      const safeDetail = [code, description].filter(Boolean).join(": ");

      if (safeDetail) {
        detailsList.push(safeDetail);
      }

      return detailsList;
    }, []);
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
 * Maps fetch lifecycle events to stable payment operation results.
 *
 * @param event - Lifecycle event emitted by the resilient fetch wrapper.
 * @returns Payment operation lifecycle result name.
 */
function mapMercadoPagoLifecycleResult(
  event: Parameters<FetchLifecycleLogger>[0]
): string {
  switch (event.event) {
    case FETCH_LIFECYCLE_EVENT.retryScheduled:
      return MERCADO_PAGO_PAYMENT_OPERATION_RESULT.retryScheduled;
    case FETCH_LIFECYCLE_EVENT.timeoutAbort:
      return MERCADO_PAGO_PAYMENT_OPERATION_RESULT.timeoutAbort;
    case FETCH_LIFECYCLE_EVENT.requestFailed:
      return MERCADO_PAGO_PAYMENT_OPERATION_RESULT.requestFailed;
    case FETCH_LIFECYCLE_EVENT.requestAttempted:
    default:
      return MERCADO_PAGO_PAYMENT_OPERATION_RESULT.requestAttempted;
  }
}

/**
 * Resolves the log level that matches a Mercado Pago fetch lifecycle event.
 *
 * @param event - Lifecycle event emitted by the resilient fetch wrapper.
 * @returns Log level for the lifecycle event.
 */
function resolveMercadoPagoLifecycleLogLevel(
  event: Parameters<FetchLifecycleLogger>[0]
) {
  if (
    event.event === FETCH_LIFECYCLE_EVENT.requestFailed ||
    event.event === FETCH_LIFECYCLE_EVENT.timeoutAbort
  ) {
    return SERVER_LOG_LEVEL.error;
  }

  if (event.event === FETCH_LIFECYCLE_EVENT.retryScheduled) {
    return SERVER_LOG_LEVEL.warn;
  }

  return SERVER_LOG_LEVEL.info;
}

/**
 * Builds a payment operation lifecycle logger for one Mercado Pago request.
 *
 * @param operation - Stable operation name used by server logs.
 * @param traceContext - Payment operation trace context.
 * @returns Lifecycle logger compatible with the resilient fetch wrapper.
 */
function buildMercadoPagoLifecycleLogger(
  operation: string,
  traceContext: PaymentOperationTraceContext | undefined
): FetchLifecycleLogger | undefined {
  if (!traceContext) {
    return undefined;
  }

  return (event) => {
    logPaymentOperation({
      context: traceContext,
      level: resolveMercadoPagoLifecycleLogLevel(event),
      message: MERCADO_PAGO_PAYMENT_OPERATION_LOG.lifecycleMessage,
      metadata: {
        attempt: event.attempt,
        method: event.method,
        reason: event.reason,
        status: event.status,
      },
      operation,
      result: mapMercadoPagoLifecycleResult(event),
    });
  };
}

/**
 * Sends a Mercado Pago request with timeout, retry, and lifecycle tracing.
 *
 * @param operation - Stable operation name used by server logs.
 * @param url - Mercado Pago endpoint URL. The value is not logged directly.
 * @param init - Fetch request options.
 * @param traceContext - Payment operation trace context.
 * @returns HTTP response returned by Mercado Pago after retry handling.
 */
async function fetchMercadoPago(
  operation: string,
  url: string,
  init: RequestInit,
  traceContext?: PaymentOperationTraceContext
): Promise<HttpResponse> {
  const mercadoPagoFetch: HttpFetcher = (input, requestInit) =>
    fetch(input, requestInit);

  return fetchWithResilience(mercadoPagoFetch, url, init, {
    ...MERCADO_PAGO_FETCH_RESILIENCE,
    lifecycleLogger: buildMercadoPagoLifecycleLogger(operation, traceContext),
  });
}

/**
 * Logs the final payment operation result using provider-safe metadata.
 *
 * @param input - Operation trace data and result metadata.
 * @returns Nothing.
 */
function logMercadoPagoOperationResult(input: {
  operation: string;
  traceContext?: PaymentOperationTraceContext;
  result: string;
  level?: "info" | "warn" | "error";
  metadata?: Record<string, unknown>;
  providerPlanId?: string | null;
  preapprovalId?: string | null;
  error?: unknown;
}): void {
  logPaymentOperation({
    context: input.traceContext,
    error: input.error,
    level: input.level,
    message:
      input.level === SERVER_LOG_LEVEL.error ||
      input.level === SERVER_LOG_LEVEL.warn
        ? MERCADO_PAGO_PAYMENT_OPERATION_LOG.failedMessage
        : MERCADO_PAGO_PAYMENT_OPERATION_LOG.completedMessage,
    metadata: input.metadata,
    operation: input.operation,
    preapprovalId: input.preapprovalId,
    providerPlanId: input.providerPlanId,
    result: input.result,
  });
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
        ? Math.round(
            body.auto_recurring.transaction_amount * CENTS_PER_CURRENCY_UNIT
          )
        : null,
    currency: body.auto_recurring?.currency_id ?? null,
    externalReference:
      body.external_reference === undefined || body.external_reference === null
        ? null
        : String(body.external_reference),
    id: body.id ?? fallbackPlanId,
    reason: body.reason ?? null,
    status: body.status,
    trial:
      typeof body.auto_recurring?.free_trial?.frequency === "number" &&
      (body.auto_recurring.free_trial.frequency_type ===
        TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days ||
        body.auto_recurring.free_trial.frequency_type ===
          TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.months)
        ? {
            frequency: body.auto_recurring.free_trial.frequency,
            frequencyType: body.auto_recurring.free_trial.frequency_type,
          }
        : null,
  };
}

/**
 * Builds the Mercado Pago free trial payload when a trial period is configured.
 *
 * @param input - Optional trial values from the application command.
 * @returns Provider free trial payload, or null to clear the trial.
 */
function buildMercadoPagoFreeTrialPayload(input: {
  trialFrequency?: number | null;
  trialFrequencyType?: "days" | "months" | null;
}) {
  return input.trialFrequency && input.trialFrequencyType
    ? {
        frequency: input.trialFrequency,
        frequency_type: input.trialFrequencyType,
      }
    : null;
}

/**
 * Parses a provider JSON response and validates HTTP success.
 *
 * @param operation - Stable operation name used by server logs.
 * @param response - Fetch response returned by Mercado Pago.
 * @param traceContext - Payment operation trace context.
 * @returns Parsed JSON body.
 * @throws When Mercado Pago returns a non-successful response.
 */
async function readMercadoPagoResponse<T>(
  operation: string,
  response: HttpResponse,
  traceContext?: PaymentOperationTraceContext
): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    logMercadoPagoOperationResult({
      level: "warn",
      metadata: {
        status: response.status,
      },
      operation,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.providerRejected,
      traceContext,
    });

    throw new Error(
      buildMercadoPagoRequestFailureMessage(response.status ?? 0, body)
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
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.exchangeOAuthCode;
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
  const body = await readMercadoPagoResponse<MercadoPagoOAuthResponse>(
    operation,
    response
  );

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
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.refreshAccessToken;
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
  const body = await readMercadoPagoResponse<MercadoPagoOAuthResponse>(
    operation,
    response
  );

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
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.createPreapprovalPlan;
  const response = await fetchMercadoPago(
    operation,
    MERCADO_PAGO_URL.preapprovalPlan,
    {
      body: JSON.stringify({
        auto_recurring: {
          currency_id: input.currency,
          frequency: 1,
          frequency_type: "months",
          free_trial: buildMercadoPagoFreeTrialPayload(input),
          transaction_amount: input.amountCents / CENTS_PER_CURRENCY_UNIT,
        },
        back_url: input.backUrl,
        external_reference: input.externalReference,
        reason: input.reason,
      }),
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
        [MERCADO_PAGO_HTTP.contentTypeHeader]:
          MERCADO_PAGO_HTTP.jsonContentType,
        [MERCADO_PAGO_HTTP.idempotencyHeader]: input.idempotencyKey,
      },
      method: MERCADO_PAGO_HTTP.postMethod,
    },
    input.traceContext
  );
  const body = await readMercadoPagoResponse<MercadoPagoPlanResponse>(
    operation,
    response,
    input.traceContext
  );

  if (!body.id) {
    logMercadoPagoOperationResult({
      level: SERVER_LOG_LEVEL.error,
      operation,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.invalidProviderResponse,
      traceContext: input.traceContext,
    });

    throw new Error("Mercado Pago preapproval plan response did not include id");
  }

  logMercadoPagoOperationResult({
    metadata: {
      status: response.status,
    },
    operation,
    providerPlanId: body.id,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

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
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.updatePreapprovalPlan;
  const response = await fetchMercadoPago(
    operation,
    `${MERCADO_PAGO_URL.preapprovalPlan}/${input.preapprovalPlanId}`,
    {
      body: JSON.stringify({
        auto_recurring: {
          currency_id: input.currency,
          frequency: 1,
          frequency_type:
            input.frequency === TRIBE_SUBSCRIPTION_FREQUENCY.monthly
              ? "months"
              : input.frequency,
          free_trial: buildMercadoPagoFreeTrialPayload(input),
          transaction_amount: input.amountCents / CENTS_PER_CURRENCY_UNIT,
        },
        back_url: input.backUrl,
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
    },
    input.traceContext
  );
  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalPlanResponse>(
    operation,
    response,
    input.traceContext
  );

  const providerPlan = mapMercadoPagoPreapprovalPlanResponse(
    body,
    input.preapprovalPlanId
  );

  logMercadoPagoOperationResult({
    metadata: {
      providerStatus: providerPlan.status,
      status: response.status,
    },
    operation,
    providerPlanId: providerPlan.id,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

  return providerPlan;
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
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.getPreapprovalPlan;
  const response = await fetchMercadoPago(
    operation,
    `${MERCADO_PAGO_URL.preapprovalPlan}/${input.preapprovalPlanId}`,
    {
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      },
      method: MERCADO_PAGO_HTTP.getMethod,
    },
    input.traceContext
  );

  if (response.status === HTTP_STATUS_NOT_FOUND) {
    logMercadoPagoOperationResult({
      metadata: {
        status: response.status,
      },
      operation,
      providerPlanId: input.preapprovalPlanId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.notFound,
      traceContext: input.traceContext,
    });

    return null;
  }

  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalPlanResponse>(
    operation,
    response,
    input.traceContext
  );

  const providerPlan = mapMercadoPagoPreapprovalPlanResponse(
    body,
    input.preapprovalPlanId
  );

  logMercadoPagoOperationResult({
    metadata: {
      providerStatus: providerPlan.status,
      status: response.status,
    },
    operation,
    providerPlanId: providerPlan.id,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

  return providerPlan;
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
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.searchPreapprovalPlans;
  const searchUrl = new URL(`${MERCADO_PAGO_URL.preapprovalPlan}/search`);

  searchUrl.searchParams.set("external_reference", input.externalReference);

  const response = await fetchMercadoPago(
    operation,
    searchUrl.toString(),
    {
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      },
      method: MERCADO_PAGO_HTTP.getMethod,
    },
    input.traceContext
  );
  const body =
    await readMercadoPagoResponse<MercadoPagoPreapprovalPlanSearchResponse>(
      operation,
      response,
      input.traceContext
    );

  const providerPlans = (body.results ?? []).map((plan) =>
    mapMercadoPagoPreapprovalPlanResponse(plan, plan.id ?? "")
  );

  logMercadoPagoOperationResult({
    metadata: {
      matchCount: providerPlans.length,
      status: response.status,
    },
    operation,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

  return providerPlans;
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
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.getPreapprovalPlanStatus;
  const response = await fetchMercadoPago(
    operation,
    `${MERCADO_PAGO_URL.preapprovalPlan}/${input.preapprovalPlanId}`,
    {
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      },
      method: MERCADO_PAGO_HTTP.getMethod,
    },
    input.traceContext
  );

  if (response.status === HTTP_STATUS_NOT_FOUND) {
    logMercadoPagoOperationResult({
      metadata: {
        status: response.status,
      },
      operation,
      providerPlanId: input.preapprovalPlanId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.notFound,
      traceContext: input.traceContext,
    });

    return null;
  }

  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalPlanResponse>(
    operation,
    response,
    input.traceContext
  );

  if (!body.status) {
    logMercadoPagoOperationResult({
      level: SERVER_LOG_LEVEL.error,
      operation,
      providerPlanId: input.preapprovalPlanId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.invalidProviderResponse,
      traceContext: input.traceContext,
    });

    throw new Error(
      "Mercado Pago preapproval plan response did not include status"
    );
  }

  logMercadoPagoOperationResult({
    metadata: {
      providerStatus: body.status,
      status: response.status,
    },
    operation,
    providerPlanId: input.preapprovalPlanId,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

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
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.createPreapprovalSubscription;
  const response = await fetchMercadoPago(
    operation,
    MERCADO_PAGO_URL.preapproval,
    {
      body: JSON.stringify({
        back_url: input.backUrl,
        external_reference: input.externalReference,
        payer_email: input.payerEmail,
        preapproval_plan_id: input.preapprovalPlanId,
        reason: input.reason,
        status: "pending",
      }),
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
        [MERCADO_PAGO_HTTP.contentTypeHeader]:
          MERCADO_PAGO_HTTP.jsonContentType,
        [MERCADO_PAGO_HTTP.idempotencyHeader]: input.idempotencyKey,
      },
      method: MERCADO_PAGO_HTTP.postMethod,
    },
    input.traceContext
  );
  const body =
    await readMercadoPagoResponse<MercadoPagoSubscriptionResponse>(
      operation,
      response,
      input.traceContext
    );

  if (!body.id || !body.init_point) {
    logMercadoPagoOperationResult({
      level: SERVER_LOG_LEVEL.error,
      operation,
      providerPlanId: input.preapprovalPlanId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.invalidProviderResponse,
      traceContext: input.traceContext,
    });

    throw new Error(
      "Mercado Pago preapproval response did not include id or init_point"
    );
  }

  logMercadoPagoOperationResult({
    metadata: {
      status: response.status,
    },
    operation,
    preapprovalId: body.id,
    providerPlanId: input.preapprovalPlanId,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

  return {
    checkoutUrl: body.init_point,
    providerSubscriptionId: body.id,
  };
}

/**
 * Updates the back URL of an existing Mercado Pago preapproval subscription.
 *
 * The preapproval id is generated by Mercado Pago at creation time, so the
 * authoritative `preapproval_id` can only be embedded in the back URL after the
 * subscription exists. Linking it back lets the tribe return page run its
 * pending-return handling even when Mercado Pago redirects to the root back URL
 * without appending the id (its append is only guaranteed on the init_point).
 *
 * @param input - Provider subscription identifier, account token, and new back URL.
 * @returns Nothing; rejects when Mercado Pago refuses the update.
 */
export async function updateMercadoPagoPreapprovalBackUrl(
  input: MercadoPagoPreapprovalBackUrlUpdateInput
): Promise<void> {
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.updatePreapprovalBackUrl;
  const response = await fetchMercadoPago(
    operation,
    `${MERCADO_PAGO_URL.preapproval}/${input.preapprovalId}`,
    {
      body: JSON.stringify({
        back_url: input.backUrl,
      }),
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
        [MERCADO_PAGO_HTTP.contentTypeHeader]:
          MERCADO_PAGO_HTTP.jsonContentType,
      },
      method: MERCADO_PAGO_HTTP.putMethod,
    },
    input.traceContext
  );

  await readMercadoPagoResponse<MercadoPagoPreapprovalResponse>(
    operation,
    response,
    input.traceContext
  );

  logMercadoPagoOperationResult({
    metadata: {
      status: response.status,
    },
    operation,
    preapprovalId: input.preapprovalId,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });
}

/**
 * Updates a Mercado Pago preapproval subscription status.
 *
 * @param input - Provider subscription identifier, account token, and target status.
 * @returns The status confirmed by Mercado Pago.
 */
export async function updateMercadoPagoPreapprovalSubscriptionStatus(input: {
  accessToken: string;
  preapprovalId: string;
  status: "canceled";
  traceContext?: PaymentOperationTraceContext;
}): Promise<string> {
  const operation =
    MERCADO_PAGO_PAYMENT_OPERATION.updatePreapprovalSubscriptionStatus;
  const response = await fetchMercadoPago(
    operation,
    `${MERCADO_PAGO_URL.preapproval}/${input.preapprovalId}`,
    {
      body: JSON.stringify({
        status: input.status,
      }),
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
        [MERCADO_PAGO_HTTP.contentTypeHeader]:
          MERCADO_PAGO_HTTP.jsonContentType,
      },
      method: MERCADO_PAGO_HTTP.putMethod,
    },
    input.traceContext
  );
  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalResponse>(
    operation,
    response,
    input.traceContext
  );

  if (!body.status) {
    logMercadoPagoOperationResult({
      level: SERVER_LOG_LEVEL.error,
      operation,
      preapprovalId: input.preapprovalId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.invalidProviderResponse,
      traceContext: input.traceContext,
    });

    throw new Error(
      MERCADO_PAGO_RESPONSE_ERROR_MESSAGE.preapprovalMissingStatus
    );
  }

  logMercadoPagoOperationResult({
    metadata: {
      providerStatus: body.status,
      status: response.status,
    },
    operation,
    preapprovalId: input.preapprovalId,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

  return body.status;
}

/**
 * Reads the current Mercado Pago preapproval status from the provider.
 *
 * @param input - Provider subscription identifier and account token.
 * @returns Provider status value, or null when the preapproval does not exist.
 */
export async function getMercadoPagoPreapprovalStatus(
  input: MercadoPagoPreapprovalStatusInput
): Promise<string | null> {
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.getPreapprovalStatus;
  const response = await fetchMercadoPago(
    operation,
    `${MERCADO_PAGO_URL.preapproval}/${input.preapprovalId}`,
    {
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      },
      method: MERCADO_PAGO_HTTP.getMethod,
    },
    input.traceContext
  );

  if (response.status === HTTP_STATUS_NOT_FOUND) {
    logMercadoPagoOperationResult({
      metadata: {
        status: response.status,
      },
      operation,
      preapprovalId: input.preapprovalId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.notFound,
      traceContext: input.traceContext,
    });

    return null;
  }

  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalResponse>(
    operation,
    response,
    input.traceContext
  );

  if (!body.status) {
    logMercadoPagoOperationResult({
      level: SERVER_LOG_LEVEL.error,
      operation,
      preapprovalId: input.preapprovalId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.invalidProviderResponse,
      traceContext: input.traceContext,
    });

    throw new Error(
      MERCADO_PAGO_RESPONSE_ERROR_MESSAGE.preapprovalMissingStatus
    );
  }

  logMercadoPagoOperationResult({
    metadata: {
      providerStatus: body.status,
      status: response.status,
    },
    operation,
    preapprovalId: input.preapprovalId,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

  return body.status;
}

/**
 * Reads Mercado Pago preapproval details required to recover plan checkout returns.
 *
 * @param input - Provider subscription identifier and account token.
 * @returns Provider preapproval details, or null when the preapproval does not exist.
 */
export async function getMercadoPagoPreapprovalDetails(
  input: MercadoPagoPreapprovalDetailsInput
): Promise<MercadoPagoPreapprovalDetailsResult | null> {
  const operation = MERCADO_PAGO_PAYMENT_OPERATION.getPreapprovalDetails;
  const response = await fetchMercadoPago(
    operation,
    `${MERCADO_PAGO_URL.preapproval}/${input.preapprovalId}`,
    {
      headers: {
        [MERCADO_PAGO_HTTP.authorizationHeader]:
          MERCADO_PAGO_HTTP.bearerPrefix + input.accessToken,
      },
      method: MERCADO_PAGO_HTTP.getMethod,
    },
    input.traceContext
  );

  if (response.status === HTTP_STATUS_NOT_FOUND) {
    logMercadoPagoOperationResult({
      metadata: {
        status: response.status,
      },
      operation,
      preapprovalId: input.preapprovalId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.notFound,
      traceContext: input.traceContext,
    });

    return null;
  }

  const body = await readMercadoPagoResponse<MercadoPagoPreapprovalResponse>(
    operation,
    response,
    input.traceContext
  );

  if (!body.status) {
    logMercadoPagoOperationResult({
      level: SERVER_LOG_LEVEL.error,
      operation,
      preapprovalId: input.preapprovalId,
      result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.invalidProviderResponse,
      traceContext: input.traceContext,
    });

    throw new Error(
      MERCADO_PAGO_RESPONSE_ERROR_MESSAGE.preapprovalMissingStatus
    );
  }

  const providerPreapprovalDetails = {
    externalReference:
      body.external_reference === undefined || body.external_reference === null
        ? null
        : String(body.external_reference),
    id: body.id ?? input.preapprovalId,
    preapprovalPlanId: body.preapproval_plan_id ?? null,
    status: body.status,
  };

  logMercadoPagoOperationResult({
    metadata: {
      providerStatus: providerPreapprovalDetails.status,
      status: response.status,
    },
    operation,
    preapprovalId: providerPreapprovalDetails.id,
    providerPlanId: providerPreapprovalDetails.preapprovalPlanId,
    result: MERCADO_PAGO_PAYMENT_OPERATION_RESULT.success,
    traceContext: input.traceContext,
  });

  return providerPreapprovalDetails;
}
