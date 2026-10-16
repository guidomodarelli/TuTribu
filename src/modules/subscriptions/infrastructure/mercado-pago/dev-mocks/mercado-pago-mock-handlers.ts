/**
 * In-memory Mercado Pago API for the local development server.
 *
 * Answers the endpoints consumed by `mercado-pago-subscription-gateway` so
 * seller connections, price plans and member checkouts work without real
 * credentials. Development only: it is started from `instrumentation-node.ts`
 * when `MOCK_EXTERNAL_APIS` is on.
 *
 * @module mercado-pago-mock-handlers
 */

import { http, HttpResponse, type HttpHandler } from "msw/http";

import {
  MERCADO_PAGO_MOCK_CHECKOUT_STATUS_ENVIRONMENT_VARIABLE,
  MERCADO_PAGO_URL,
} from "@/src/modules/subscriptions/constants/mercado-pago";
import { MERCADO_PAGO_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-status-mapper";

/** Status the mock assigns to a member checkout once it is created. */
export type MercadoPagoMockCheckoutStatus =
  | typeof MERCADO_PAGO_SUBSCRIPTION_STATUS.authorized
  | typeof MERCADO_PAGO_SUBSCRIPTION_STATUS.pending;

/** Options that shape the simulated provider behavior. */
export type MercadoPagoMockOptions = {
  /**
   * `authorized` (default) simulates a member who completes the hosted checkout;
   * `pending` simulates one who abandons it.
   */
  checkoutStatus?: MercadoPagoMockCheckoutStatus;
};

type MercadoPagoMockPlan = {
  auto_recurring: Record<string, unknown>;
  back_url: unknown;
  external_reference: unknown;
  id: string;
  reason: unknown;
  status: string;
};

type MercadoPagoMockPreapproval = {
  back_url: string;
  external_reference: unknown;
  id: string;
  init_point: string;
  preapproval_plan_id: string | null;
  status: string;
};

type MercadoPagoMockRequestBody = Record<string, unknown>;

/** Recurring invoice ("authorized payment") with its already approved payment. */
type MercadoPagoMockInvoice = {
  currency_id: string | null;
  debit_date: string;
  id: string;
  last_modified: string;
  payment: { id: string; status: string; status_detail: string };
  preapproval_id: string;
  status: string;
  transaction_amount: number | null;
};

type MercadoPagoMockRecurringTerms = {
  currencyId: string | null;
  transactionAmount: number | null;
};

const MERCADO_PAGO_MOCK_PLAN_STATUS = {
  active: "active",
} as const;

const MERCADO_PAGO_MOCK_OAUTH = {
  accessTokenLifetimeSeconds: 15_552_000,
  authorizationCodeGrant: "authorization_code",
  firstSellerUserId: 100_000_001,
  invalidGrantError: "invalid_grant",
  refreshTokenGrant: "refresh_token",
} as const;

const MERCADO_PAGO_MOCK_QUERY_PARAM = {
  externalReference: "external_reference",
  preapprovalId: "preapproval_id",
  searchText: "q",
} as const;

const MERCADO_PAGO_MOCK_HEADER = {
  idempotencyKey: "X-Idempotency-Key",
} as const;

const MERCADO_PAGO_MOCK_PAYMENT = {
  accreditedDetail: "accredited",
  approvedStatus: "approved",
  processedInvoiceStatus: "processed",
} as const;

const MERCADO_PAGO_MOCK_ID_PREFIX = {
  accessToken: "mock-access-token-",
  invoice: "mock-invoice-",
  payment: "mock-payment-",
  plan: "mock-plan-",
  preapproval: "mock-preapproval-",
  refreshToken: "mock-refresh-token-",
} as const;

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_CREATED = 201;
const HTTP_STATUS_NOT_FOUND = 404;

/**
 * Reads a JSON request body as a plain object, tolerating empty bodies.
 *
 * @param request - Intercepted request.
 * @returns Parsed body, or an empty object.
 */
async function readJsonBody(request: Request): Promise<MercadoPagoMockRequestBody> {
  const body: unknown = await request.json().catch(() => ({}));

  return body && typeof body === "object" ? (body as MercadoPagoMockRequestBody) : {};
}

/**
 * Builds a Mercado Pago style error response.
 *
 * @param status - HTTP status code.
 * @param message - Provider error message.
 * @returns JSON error response.
 */
function buildMercadoPagoMockError(status: number, message: string) {
  return HttpResponse.json({ error: message, message, status }, { status });
}

/**
 * Adds the `preapproval_id` query parameter Mercado Pago appends on return.
 *
 * @param backUrl - Tribe return URL sent by the gateway.
 * @param preapprovalId - Mock preapproval identifier.
 * @returns The URL the member lands on after the simulated checkout.
 */
function buildReturnUrl(backUrl: string, preapprovalId: string): string {
  const returnUrl = new URL(backUrl);

  returnUrl.searchParams.set(MERCADO_PAGO_MOCK_QUERY_PARAM.preapprovalId, preapprovalId);

  return returnUrl.toString();
}

/**
 * Reads the charged amount and currency of a checkout: its own monthly terms,
 * or the terms of the plan it subscribes to.
 *
 * @param body - Preapproval creation body.
 * @param plans - Stored plans.
 * @returns Recurring terms, with nulls when the checkout carries none.
 */
function resolveRecurringTerms(
  body: MercadoPagoMockRequestBody,
  plans: Map<string, MercadoPagoMockPlan>
): MercadoPagoMockRecurringTerms {
  const autoRecurring =
    (body.auto_recurring as Record<string, unknown> | undefined) ??
    (typeof body.preapproval_plan_id === "string"
      ? plans.get(body.preapproval_plan_id)?.auto_recurring
      : undefined);

  return {
    currencyId:
      typeof autoRecurring?.currency_id === "string" ? autoRecurring.currency_id : null,
    transactionAmount:
      typeof autoRecurring?.transaction_amount === "number"
        ? autoRecurring.transaction_amount
        : null,
  };
}

/**
 * Builds the first, already paid invoice of an approved checkout, as Mercado
 * Pago charges it right after the member authorizes the subscription.
 *
 * @param preapprovalId - Mock preapproval identifier.
 * @param terms - Charged amount and currency.
 * @returns Processed invoice with an approved payment.
 */
function buildApprovedInvoice(
  preapprovalId: string,
  terms: MercadoPagoMockRecurringTerms
): MercadoPagoMockInvoice {
  const chargedAt = new Date().toISOString();

  return {
    currency_id: terms.currencyId,
    debit_date: chargedAt,
    id: MERCADO_PAGO_MOCK_ID_PREFIX.invoice + crypto.randomUUID(),
    last_modified: chargedAt,
    payment: {
      id: MERCADO_PAGO_MOCK_ID_PREFIX.payment + crypto.randomUUID(),
      status: MERCADO_PAGO_MOCK_PAYMENT.approvedStatus,
      status_detail: MERCADO_PAGO_MOCK_PAYMENT.accreditedDetail,
    },
    preapproval_id: preapprovalId,
    status: MERCADO_PAGO_MOCK_PAYMENT.processedInvoiceStatus,
    transaction_amount: terms.transactionAmount,
  };
}

/**
 * Projects a stored preapproval into the provider response shape.
 *
 * @param preapproval - Stored preapproval.
 * @returns Provider response body.
 */
function toPreapprovalResponse(preapproval: MercadoPagoMockPreapproval) {
  return {
    back_url: preapproval.back_url,
    external_reference: preapproval.external_reference,
    id: preapproval.id,
    init_point: preapproval.init_point,
    preapproval_plan_id: preapproval.preapproval_plan_id,
    status: preapproval.status,
  };
}

/**
 * Reads the simulated provider behavior from the development environment.
 *
 * @param environment - Process environment values.
 * @returns Mock options; unknown values keep the defaults.
 */
export function resolveMercadoPagoMockOptions(
  environment: Partial<Record<string, string | undefined>>
): MercadoPagoMockOptions {
  const checkoutStatus = environment[
    MERCADO_PAGO_MOCK_CHECKOUT_STATUS_ENVIRONMENT_VARIABLE
  ]
    ?.trim()
    .toLowerCase();

  return checkoutStatus === MERCADO_PAGO_SUBSCRIPTION_STATUS.pending ||
    checkoutStatus === MERCADO_PAGO_SUBSCRIPTION_STATUS.authorized
    ? { checkoutStatus }
    : {};
}

/**
 * Creates the request handlers of an isolated in-memory Mercado Pago account.
 *
 * Each call owns its own state, so restarting the server or a test resets it.
 *
 * @param options - Simulated provider behavior.
 * @returns MSW handlers for the Mercado Pago endpoints used by the gateway.
 */
export function createMercadoPagoMockHandlers(
  options: MercadoPagoMockOptions = {}
): HttpHandler[] {
  const checkoutStatus =
    options.checkoutStatus ?? MERCADO_PAGO_SUBSCRIPTION_STATUS.authorized;
  const plans = new Map<string, MercadoPagoMockPlan>();
  const preapprovals = new Map<string, MercadoPagoMockPreapproval>();
  const preapprovalIdsByIdempotencyKey = new Map<string, string>();
  const invoices = new Map<string, MercadoPagoMockInvoice>();
  const sellerUserIdsByRefreshToken = new Map<string, number>();
  let nextSellerUserId: number = MERCADO_PAGO_MOCK_OAUTH.firstSellerUserId;

  /**
   * Issues a fresh token pair for a seller account.
   *
   * @param userId - Mock seller identifier.
   * @returns OAuth token response body.
   */
  const issueTokens = (userId: number) => {
    const refreshToken = MERCADO_PAGO_MOCK_ID_PREFIX.refreshToken + crypto.randomUUID();

    sellerUserIdsByRefreshToken.set(refreshToken, userId);

    return {
      access_token: MERCADO_PAGO_MOCK_ID_PREFIX.accessToken + crypto.randomUUID(),
      expires_in: MERCADO_PAGO_MOCK_OAUTH.accessTokenLifetimeSeconds,
      refresh_token: refreshToken,
      user_id: userId,
    };
  };

  return [
    http.post(MERCADO_PAGO_URL.oauthToken, async ({ request }) => {
      const body = await readJsonBody(request);

      if (body.grant_type === MERCADO_PAGO_MOCK_OAUTH.authorizationCodeGrant) {
        const userId = nextSellerUserId;

        nextSellerUserId += 1;

        return HttpResponse.json(issueTokens(userId));
      }

      const refreshToken =
        body.grant_type === MERCADO_PAGO_MOCK_OAUTH.refreshTokenGrant &&
        typeof body.refresh_token === "string"
          ? body.refresh_token
          : "";
      const userId = sellerUserIdsByRefreshToken.get(refreshToken);

      if (userId === undefined) {
        return buildMercadoPagoMockError(
          HTTP_STATUS_BAD_REQUEST,
          MERCADO_PAGO_MOCK_OAUTH.invalidGrantError
        );
      }

      sellerUserIdsByRefreshToken.delete(refreshToken);

      return HttpResponse.json(issueTokens(userId));
    }),

    http.get(`${MERCADO_PAGO_URL.preapprovalPlan}/search`, ({ request }) => {
      const externalReference = new URL(request.url).searchParams.get(
        MERCADO_PAGO_MOCK_QUERY_PARAM.externalReference
      );
      const results = [...plans.values()].filter(
        (plan) => String(plan.external_reference) === externalReference
      );

      return HttpResponse.json({ paging: { total: results.length }, results });
    }),

    http.post(MERCADO_PAGO_URL.preapprovalPlan, async ({ request }) => {
      const body = await readJsonBody(request);
      const plan: MercadoPagoMockPlan = {
        auto_recurring: (body.auto_recurring ?? {}) as Record<string, unknown>,
        back_url: body.back_url,
        external_reference: body.external_reference,
        id: MERCADO_PAGO_MOCK_ID_PREFIX.plan + crypto.randomUUID(),
        reason: body.reason,
        status: MERCADO_PAGO_MOCK_PLAN_STATUS.active,
      };

      plans.set(plan.id, plan);

      return HttpResponse.json(plan, { status: HTTP_STATUS_CREATED });
    }),

    http.get(`${MERCADO_PAGO_URL.preapprovalPlan}/:planId`, ({ params }) => {
      const plan = plans.get(String(params.planId));

      return plan
        ? HttpResponse.json(plan)
        : buildMercadoPagoMockError(HTTP_STATUS_NOT_FOUND, "preapproval_plan not found");
    }),

    http.put(`${MERCADO_PAGO_URL.preapprovalPlan}/:planId`, async ({ params, request }) => {
      const plan = plans.get(String(params.planId));

      if (!plan) {
        return buildMercadoPagoMockError(HTTP_STATUS_NOT_FOUND, "preapproval_plan not found");
      }

      const body = await readJsonBody(request);
      const updatedPlan: MercadoPagoMockPlan = {
        ...plan,
        auto_recurring: (body.auto_recurring ?? plan.auto_recurring) as Record<string, unknown>,
        back_url: body.back_url ?? plan.back_url,
        external_reference: body.external_reference ?? plan.external_reference,
        reason: body.reason ?? plan.reason,
        status: typeof body.status === "string" ? body.status : plan.status,
      };

      plans.set(updatedPlan.id, updatedPlan);

      return HttpResponse.json(updatedPlan);
    }),

    http.get(`${MERCADO_PAGO_URL.preapproval}/search`, ({ request }) => {
      const searchText = new URL(request.url).searchParams.get(
        MERCADO_PAGO_MOCK_QUERY_PARAM.searchText
      );
      const results = [...preapprovals.values()]
        .filter((preapproval) => String(preapproval.external_reference) === searchText)
        .map(toPreapprovalResponse);

      return HttpResponse.json({ paging: { total: results.length }, results });
    }),

    http.post(MERCADO_PAGO_URL.preapproval, async ({ request }) => {
      const idempotencyKey = request.headers.get(MERCADO_PAGO_MOCK_HEADER.idempotencyKey);
      const previousPreapproval = idempotencyKey
        ? preapprovals.get(preapprovalIdsByIdempotencyKey.get(idempotencyKey) ?? "")
        : undefined;

      if (previousPreapproval) {
        return HttpResponse.json(toPreapprovalResponse(previousPreapproval), {
          status: HTTP_STATUS_CREATED,
        });
      }

      const body = await readJsonBody(request);

      if (typeof body.back_url !== "string") {
        return buildMercadoPagoMockError(HTTP_STATUS_BAD_REQUEST, "back_url is required");
      }

      const preapprovalId = MERCADO_PAGO_MOCK_ID_PREFIX.preapproval + crypto.randomUUID();
      const preapproval: MercadoPagoMockPreapproval = {
        back_url: body.back_url,
        external_reference: body.external_reference,
        id: preapprovalId,
        init_point: buildReturnUrl(body.back_url, preapprovalId),
        preapproval_plan_id:
          typeof body.preapproval_plan_id === "string" ? body.preapproval_plan_id : null,
        status: checkoutStatus,
      };

      preapprovals.set(preapprovalId, preapproval);

      if (preapproval.status === MERCADO_PAGO_SUBSCRIPTION_STATUS.authorized) {
        const invoice = buildApprovedInvoice(
          preapprovalId,
          resolveRecurringTerms(body, plans)
        );

        invoices.set(invoice.id, invoice);
      }

      if (idempotencyKey) {
        preapprovalIdsByIdempotencyKey.set(idempotencyKey, preapprovalId);
      }

      return HttpResponse.json(toPreapprovalResponse(preapproval), {
        status: HTTP_STATUS_CREATED,
      });
    }),

    http.get(`${MERCADO_PAGO_URL.preapproval}/:preapprovalId`, ({ params }) => {
      const preapproval = preapprovals.get(String(params.preapprovalId));

      return preapproval
        ? HttpResponse.json(toPreapprovalResponse(preapproval))
        : buildMercadoPagoMockError(HTTP_STATUS_NOT_FOUND, "preapproval not found");
    }),

    http.put(`${MERCADO_PAGO_URL.preapproval}/:preapprovalId`, async ({ params, request }) => {
      const preapproval = preapprovals.get(String(params.preapprovalId));

      if (!preapproval) {
        return buildMercadoPagoMockError(HTTP_STATUS_NOT_FOUND, "preapproval not found");
      }

      const body = await readJsonBody(request);
      const backUrl = typeof body.back_url === "string" ? body.back_url : preapproval.back_url;
      const updatedPreapproval: MercadoPagoMockPreapproval = {
        ...preapproval,
        back_url: backUrl,
        init_point: buildReturnUrl(backUrl, preapproval.id),
        status: typeof body.status === "string" ? body.status : preapproval.status,
      };

      preapprovals.set(updatedPreapproval.id, updatedPreapproval);

      return HttpResponse.json(toPreapprovalResponse(updatedPreapproval));
    }),

    http.get(`${MERCADO_PAGO_URL.authorizedPayments}/search`, ({ request }) => {
      const preapprovalId = new URL(request.url).searchParams.get(
        MERCADO_PAGO_MOCK_QUERY_PARAM.preapprovalId
      );
      const results = [...invoices.values()].filter(
        (invoice) => invoice.preapproval_id === preapprovalId
      );

      return HttpResponse.json({ paging: { total: results.length }, results });
    }),

    http.get(
      `${MERCADO_PAGO_URL.authorizedPayments}/:authorizedPaymentId`,
      ({ params }) => {
        const invoice = invoices.get(String(params.authorizedPaymentId));

        return invoice
          ? HttpResponse.json(invoice)
          : buildMercadoPagoMockError(HTTP_STATUS_NOT_FOUND, "authorized_payment not found");
      }
    ),

    http.get(`${MERCADO_PAGO_URL.payments}/:paymentId`, ({ params }) => {
      const invoice = [...invoices.values()].find(
        (candidate) => candidate.payment.id === String(params.paymentId)
      );

      return invoice
        ? HttpResponse.json({
            date_last_updated: invoice.last_modified,
            id: invoice.payment.id,
            status: invoice.payment.status,
            status_detail: invoice.payment.status_detail,
          })
        : buildMercadoPagoMockError(HTTP_STATUS_NOT_FOUND, "payment not found");
    }),
  ];
}
