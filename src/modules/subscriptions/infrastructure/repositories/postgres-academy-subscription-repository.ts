/**
 * Postgres + Mercado Pago adapter of academy subscriptions.
 *
 * Checkout: a pending local reservation (product `academy`, frozen price and
 * offer snapshot) is persisted first, the provider subscription is created
 * once under a durable local creation claim, and the provider id is linked
 * before redirecting. Ambiguous retries search the seller's subscriptions
 * by reservation reference; they never repeat creation blindly.
 *
 * Coverage: access comes only from verified invoices. Every invoice
 * notification triggers a server-to-server reconciliation of the whole
 * subscription (paginated invoice search with the token of the subscription
 * integration), and each invoice is applied in its own transaction: ledger
 * row, paid grant (or its revocation) and audit, with the subscription row
 * locked so concurrent deliveries serialize. No database lock is held while
 * calling the provider.
 *
 * The remote `authorized` status only drives the renewal state; it never
 * grants access, and academy subscriptions never change the basic membership.
 *
 * @module postgres-academy-subscription-repository
 */

import { sql, type SQL } from "drizzle-orm";
import {
  classifyMercadoPagoFailure,
  MercadoPagoRequestError,
  type MercadoPagoAuthorizedPayment,
  type MercadoPagoAuthorizedPaymentInput,
  type MercadoPagoAuthorizedPaymentSearchInput,
  type MercadoPagoCheckoutReferenceInput,
  type MercadoPagoCheckoutReferenceResult,
  type MercadoPagoPayment,
  type MercadoPagoPaymentInput,
  type MercadoPagoPendingSubscriptionInput,
  type MercadoPagoPreapprovalStatusInput,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import type { PaymentOperationTraceContext } from "@/src/modules/subscriptions/infrastructure/observability/payment-operation-logger";

import {
  ACADEMY_CHECKOUT_CREATION_CLAIM_STALE_SECONDS,
  ACADEMY_COVERAGE_RECONCILIATION_THROTTLE_SECONDS,
  ACADEMY_SUBSCRIPTION_RENEWAL_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
  TRIBE_SUBSCRIPTION_PRODUCT_KEY,
  type AcademySubscriptionRenewalStatus,
} from "@/src/modules/subscriptions/constants/subscriptions";
import {
  ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE,
  ACADEMY_SUBSCRIPTION_PROVIDER_OPERATION,
  AcademySubscriptionProviderError,
  type AcademySubscriptionProviderOperation,
} from "@/src/modules/subscriptions/domain/errors/academy-subscription-provider-error";
import type {
  AcademyAuthorizedPaymentWebhookCommand,
  AcademyAuthorizedPaymentWebhookResult,
  AcademyCoverageReconciliationResult,
  AcademyPaymentWebhookCommand,
  AcademyPaymentWebhookResult,
  AcademySubscriptionRepository,
  CancelAcademyRenewalResult,
  OwnAcademyRenewal,
  StartAcademyCheckoutCommand,
  StartAcademyCheckoutResult,
} from "@/src/modules/subscriptions/domain/repositories/academy-subscription-repository";
import {
  decideAcademyInvoiceEffect,
  mergeAcademyInvoicePaymentState,
  type AcademyInvoiceDecision,
  type AcademyLedgerPaymentStatus,
  type VerifiedAcademyInvoice,
} from "@/src/modules/subscriptions/domain/services/academy-invoice-policy";
import {
  resolveMercadoPagoAccessToken,
  type MercadoPagoAccessTokenRefresher,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";
import { mapMercadoPagoSubscriptionStatus } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-status-mapper";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import type { AuditEventWriter } from "@/src/modules/shared/infrastructure/database/audit-event";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ROUTES } from "@/src/constants/routes";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

/** Grant writer injected by the composition root (product-access SQL). */
export type AcademyPaidGrantWriter = (
  database: RequestDatabase,
  grant: {
    createdBy: string | null;
    endsAt: Date;
    sourceKey: string;
    sourceType: "subscription_payment";
    startsAt: Date | null;
    tribeId: string;
    userId: string;
  }
) => Promise<{ grantId: string; inserted: boolean }>;

/** Audit writer injected by the composition root (product-access SQL). */
export type AcademySubscriptionAuditWriter = AuditEventWriter;

export type AcademySubscriptionGateway = {
  findCheckoutByReference(input: MercadoPagoCheckoutReferenceInput): Promise<MercadoPagoCheckoutReferenceResult>;
  cancelPreapproval(input: {
    accessToken: string;
    preapprovalId: string;
    status: "canceled";
    traceContext?: PaymentOperationTraceContext;
  }): Promise<string>;
  createPreapproval(
    input: MercadoPagoPendingSubscriptionInput
  ): Promise<{ checkoutUrl: string; providerSubscriptionId: string }>;
  getAuthorizedPayment(
    input: MercadoPagoAuthorizedPaymentInput
  ): Promise<MercadoPagoAuthorizedPayment | null>;
  getPayment(input: MercadoPagoPaymentInput): Promise<MercadoPagoPayment | null>;
  getPreapprovalStatus(input: MercadoPagoPreapprovalStatusInput): Promise<string | null>;
  refreshAccessToken: MercadoPagoAccessTokenRefresher;
  searchAuthorizedPayments(
    input: MercadoPagoAuthorizedPaymentSearchInput
  ): Promise<MercadoPagoAuthorizedPayment[]>;
};

const ACADEMY_SUBSCRIPTION_AUDIT_ACTION = {
  cancelRequested: "academy_renewal_cancel_requested",
  checkoutReplaced: "academy_checkout_replaced",
  checkoutReserved: "academy_checkout_reserved",
  paymentRecorded: "academy_payment_recorded",
} as const;

/** Audited reason of a reservation replaced because the provider never created its checkout. */
const STALE_CHECKOUT_REPLACEMENT_REASON = "provider_checkout_absent";

const ACADEMY_SUBSCRIPTION_AUDIT_ENTITY = {
  paymentPeriod: "subscription_payment_period",
  subscription: "tribe_member_subscription",
} as const;

const ACADEMY_OPERATION = {
  cancelKeyPrefix: "academy-cancel:",
  creationKeyPrefix: "academy-provider-creation:",
  creationType: "create_academy_provider_subscription",
  checkoutKeyPrefix: "academy-checkout:",
  checkoutType: "start_academy_subscription",
  externalReferencePrefix: "tutribu:academy-subscription:",
  invoiceSourceKeyPrefix: "invoice:",
  reconcileKeyPrefix: "academy-reconcile:",
} as const;

const PAYMENT_PROVIDER = "mercado_pago";
const PAID_GRANT_SOURCE = "subscription_payment";
const PREAPPROVAL_QUERY_PARAM = "preapproval_id";
/** Provider answer for a preapproval that no longer exists. */
const PREAPPROVAL_NOT_FOUND_HTTP_STATUS = 404;
/** Ledger state of an invoice whose charge the provider rejected. */
const REJECTED_LEDGER_STATUS: AcademyLedgerPaymentStatus = "rejected";
/** Local subscription states of a recurrence the provider still runs. */
const LIVE_RENEWAL_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.active,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
]);

/**
 * Wraps a provider or token failure under the academy operation, keeping the
 * real error as cause.
 *
 * @param error - Error thrown by the gateway, the token refresh or the configuration.
 * @param operation - Academy subscription operation.
 * @returns The typed failure.
 */
function toProviderError(
  error: unknown,
  operation: AcademySubscriptionProviderOperation
): AcademySubscriptionProviderError {
  return new AcademySubscriptionProviderError(classifyMercadoPagoFailure(error), operation, { cause: error });
}

/** The seller integration has no token to call the provider with. */
function missingTokenError(operation: AcademySubscriptionProviderOperation): AcademySubscriptionProviderError {
  return new AcademySubscriptionProviderError(
    ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.integrationUnavailable,
    operation
  );
}

/** Whether the provider answered that the preapproval does not exist. */
function isMissingPreapprovalError(error: unknown): boolean {
  return error instanceof MercadoPagoRequestError && error.statusCode === PREAPPROVAL_NOT_FOUND_HTTP_STATUS;
}

type SubscriptionContextRow = {
  access_token: string | null;
  amount_cents: number;
  billing_anchor_at: string | Date | null;
  /** Read only by the coverage reconciliation, which completes a recorded cancellation. */
  cancel_requested_at?: string | Date | null;
  currency: string;
  mercado_pago_preapproval_id: string;
  payment_integration_id: string;
  refresh_token: string | null;
  subscription_id: string;
  token_expires_at: string | Date | null;
  tribe_id: string;
  user_id: string;
};

/** Provider context of a cancellation request, with whether this attempt recorded it. */
type CancellationContextRow = SubscriptionContextRow & {
  is_new_cancellation_request: boolean;
  user_id: string;
};

type ReservationRow = {
  access_token: string | null;
  checkout_url: string | null;
  mercado_pago_preapproval_id: string | null;
  payer_email: string | null;
  payment_integration_id: string;
  price_name: string;
  provider_plan_id: string;
  refresh_token: string | null;
  subscription_id: string;
  token_expires_at: string | Date | null;
  tribe_id: string;
  amount_cents: number;
  currency: string;
};

function toOptionalDate(value: string | Date | null): Date | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function buildAcademyBackUrl(tribeSlug: string, preapprovalId?: string): string {
  const path = ROUTES.tribes.academy(tribeSlug);
  const query = preapprovalId
    ? `?${new URLSearchParams({ [PREAPPROVAL_QUERY_PARAM]: preapprovalId }).toString()}`
    : "";

  return `${resolvePublicAppBaseUrl()}${path}${query}`;
}

function toVerifiedInvoice(invoice: MercadoPagoAuthorizedPayment): VerifiedAcademyInvoice {
  return {
    currencyId: invoice.currencyId,
    debitDate: invoice.debitDate,
    id: invoice.id,
    lastModified: invoice.lastModified,
    paymentId: invoice.paymentId,
    paymentStatus: invoice.paymentStatus,
    paymentStatusDetail: invoice.paymentStatusDetail,
    preapprovalId: invoice.preapprovalId,
    transactionAmount: invoice.transactionAmount,
  };
}

function compareInvoicesByDebitDate(
  first: MercadoPagoAuthorizedPayment,
  second: MercadoPagoAuthorizedPayment
): number {
  const firstTime = first.debitDate ? Date.parse(first.debitDate) : Number.MAX_SAFE_INTEGER;
  const secondTime = second.debitDate ? Date.parse(second.debitDate) : Number.MAX_SAFE_INTEGER;

  return firstTime - secondTime;
}

/**
 * Locks a subscription and reads its contract snapshot.
 */
function buildLockedSubscriptionContractStatement(subscriptionId: string): SQL {
  return sql`
        select
          tribe_member_subscriptions.id as subscription_id,
          tribe_member_subscriptions.tribe_id,
          tribe_member_subscriptions.user_id,
          tribe_member_subscriptions.mercado_pago_preapproval_id,
          tribe_member_subscriptions.payment_integration_id,
          tribe_member_subscriptions.price_snapshot_amount_cents as amount_cents,
          tribe_member_subscriptions.price_snapshot_currency as currency,
          tribe_member_subscriptions.billing_anchor_at
        from public.tribe_member_subscriptions
        where tribe_member_subscriptions.id = ${subscriptionId}
        for update
      `;
}

/**
 * Locks the ledger period already recorded for an invoice, if any.
 */
function buildLockedPaymentPeriodStatement(contract: SubscriptionContextRow, providerInvoice: MercadoPagoAuthorizedPayment): SQL {
  return sql`
        select id, payment_status, provider_last_modified_at, grant_id
        from public.subscription_payment_periods
        where payment_integration_id = ${contract.payment_integration_id}
          and provider_invoice_id = ${providerInvoice.id}
        for update
      `;
}

/**
 * Upserts the ledger period of an invoice with the decided payment state.
 */
function buildRecordPaymentPeriodStatement({
  contract,
  decision,
  grantId,
  providerInvoice,
}: {
  contract: SubscriptionContextRow;
  decision: Extract<AcademyInvoiceDecision, { kind: "record" }>;
  grantId: string | null;
  providerInvoice: MercadoPagoAuthorizedPayment;
}): SQL {
  return sql`
        insert into public.subscription_payment_periods (
          tribe_id,
          user_id,
          subscription_id,
          payment_integration_id,
          product_key,
          provider_subscription_id,
          provider_invoice_id,
          provider_payment_id,
          payment_status,
          amount_cents,
          currency,
          debit_at,
          service_starts_at,
          service_ends_at,
          provider_last_modified_at,
          grant_id,
          review_reason
        )
        values (
          ${contract.tribe_id},
          ${contract.user_id},
          ${contract.subscription_id},
          ${contract.payment_integration_id},
          ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy},
          ${contract.mercado_pago_preapproval_id},
          ${providerInvoice.id},
          ${providerInvoice.paymentId},
          ${decision.ledgerStatus},
          ${decision.amountCents},
          ${providerInvoice.currencyId ?? contract.currency},
          ${providerInvoice.debitDate},
          ${decision.serviceInterval?.startsAt ?? null},
          ${decision.serviceInterval?.endsAt ?? null},
          ${decision.providerLastModifiedAt},
          ${grantId},
          ${decision.reviewReason}
        )
        on conflict (payment_integration_id, provider_invoice_id) do update
          set payment_status = excluded.payment_status,
              provider_payment_id = coalesce(excluded.provider_payment_id, subscription_payment_periods.provider_payment_id),
              amount_cents = excluded.amount_cents,
              currency = excluded.currency,
              debit_at = coalesce(excluded.debit_at, subscription_payment_periods.debit_at),
              service_starts_at = coalesce(excluded.service_starts_at, subscription_payment_periods.service_starts_at),
              service_ends_at = coalesce(excluded.service_ends_at, subscription_payment_periods.service_ends_at),
              provider_last_modified_at = excluded.provider_last_modified_at,
              grant_id = coalesce(excluded.grant_id, subscription_payment_periods.grant_id),
              review_reason = excluded.review_reason,
              updated_at = timezone('utc', now())
        returning id
      `;
}

/**
 * Marks the viewer's live academy renewal as cancel-requested and returns its
 * provider context. An earlier request keeps its timestamp; only a request this
 * transaction recorded carries `now()`, which `is_new_cancellation_request` reports.
 */
function buildRequestRenewalCancellationStatement(tribeSlug: string): SQL {
  return sql`
        update public.tribe_member_subscriptions
        set cancel_requested_at = coalesce(tribe_member_subscriptions.cancel_requested_at, now()),
            updated_at = timezone('utc', now())
        from public.tribes, public.tribe_payment_integrations
        where tribes.id = tribe_member_subscriptions.tribe_id
          and tribes.slug = ${tribeSlug}
          and tribe_payment_integrations.id = tribe_member_subscriptions.payment_integration_id
          and tribe_payment_integrations.tribe_id = tribe_member_subscriptions.tribe_id
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          and tribe_member_subscriptions.status in (
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused}
          )
        returning
          tribe_member_subscriptions.id as subscription_id,
          tribe_member_subscriptions.tribe_id,
          tribe_member_subscriptions.user_id,
          tribe_member_subscriptions.mercado_pago_preapproval_id,
          tribe_member_subscriptions.payment_integration_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          tribe_member_subscriptions.cancel_requested_at = now() as is_new_cancellation_request
      `;
}

/**
 * Current academy price the checkout would freeze: active, current and
 * synchronized with the provider.
 */
function buildCurrentAcademyPriceStatement(tribeId: string): SQL {
  return sql`
        select tribe_subscription_prices.*
        from public.tribe_subscription_prices
        where tribe_subscription_prices.tribe_id = ${tribeId}
          and tribe_subscription_prices.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          and tribe_subscription_prices.status = 'active'
          and tribe_subscription_prices.is_current = true
          and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          and tribe_subscription_prices.payment_integration_id is not null
        limit 1
      `;
}

/**
 * Current academy price, and that same price only while it is still the one
 * the checkout validated. Both read the snapshot of the statement that writes
 * the reservation, so a price made current or edited after the validation
 * never reaches it.
 */
function buildValidatedAcademyPriceCtes(tribeId: string, validatedPrice: ValidatedAcademyPrice): SQL {
  return sql`
        current_academy_price as (${buildCurrentAcademyPriceStatement(tribeId)}),
        validated_academy_price as (
          select current_academy_price.*
          from current_academy_price
          where current_academy_price.id = ${validatedPrice?.id ?? null}
            and current_academy_price.amount_cents = ${validatedPrice?.amountCents ?? null}
            and current_academy_price.currency = ${validatedPrice?.currency ?? null}
        )`;
}

/**
 * Reads the academy sales settings, the current price and whether the buyer is verified and already covered.
 */
function buildAcademyCheckoutContextStatement(tribeId: string, userId: string): SQL {
  return sql`
        with current_academy_price as (${buildCurrentAcademyPriceStatement(tribeId)})
        select
          coalesce(tribe_academy_settings.access_model = 'academy', false) as is_academy,
          coalesce(tribe_academy_settings.sales_enabled, false) as sales_enabled,
          tribe_academy_settings.offer_version,
          (select id from current_academy_price) as price_id,
          (select amount_cents from current_academy_price) as price_amount_cents,
          (select currency from current_academy_price) as price_currency,
          public.is_member_verified_for_academy(${tribeId}, ${userId}) as is_verified,
          public.has_active_product_grant(${tribeId}, ${userId}, ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}) as is_covered
        from (select 1) as anchor
        left join public.tribe_academy_settings
          on tribe_academy_settings.tribe_id = ${tribeId}
      `;
}

/**
 * Locks the buyer's live academy subscription with its stored checkout URL
 * and whether a provider creation was ever claimed for it.
 */
function buildLockedLiveAcademySubscriptionStatement(tribeId: string, userId: string): SQL {
  return sql`
        select
          tribe_member_subscriptions.id,
          tribe_member_subscriptions.status,
          tribe_member_subscriptions.mercado_pago_preapproval_id,
          subscription_idempotency_operations.response_body->>'checkoutUrl' as checkout_url,
          exists (
            select 1
            from public.subscription_idempotency_operations as creation_claim
            where creation_claim.operation_key =
              ${ACADEMY_OPERATION.creationKeyPrefix} || tribe_member_subscriptions.id::text
          ) as has_creation_claim
        from public.tribe_member_subscriptions
        left join public.subscription_idempotency_operations
          on subscription_idempotency_operations.operation_key =
            ${ACADEMY_OPERATION.checkoutKeyPrefix} || tribe_member_subscriptions.id::text
        where tribe_member_subscriptions.tribe_id = ${tribeId}
          and tribe_member_subscriptions.user_id = ${userId}
          and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          and tribe_member_subscriptions.status in (
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.gracePeriod},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pastDue},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked}
          )
        limit 1
        for update of tribe_member_subscriptions
      `;
}

/**
 * Reads the reserved subscription with its price snapshot, seller tokens, and payer email.
 */
function buildReservationStatement(subscriptionId: string): SQL {
  return sql`
        select
          tribe_member_subscriptions.id as subscription_id,
          tribe_member_subscriptions.tribe_id,
          tribe_member_subscriptions.mercado_pago_preapproval_id,
          tribe_member_subscriptions.payment_integration_id,
          tribe_member_subscriptions.price_snapshot_name as price_name,
          tribe_member_subscriptions.price_snapshot_amount_cents as amount_cents,
          tribe_member_subscriptions.price_snapshot_currency as currency,
          tribe_member_subscriptions.price_snapshot_provider_plan_id as provider_plan_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          "user".email as payer_email,
          null::text as checkout_url
        from public.tribe_member_subscriptions
        inner join public.tribe_payment_integrations
          on tribe_payment_integrations.id = tribe_member_subscriptions.payment_integration_id
          and tribe_payment_integrations.tribe_id = tribe_member_subscriptions.tribe_id
        inner join public."user"
          on "user".id = tribe_member_subscriptions.user_id
        where tribe_member_subscriptions.id = ${subscriptionId}
      `;
}

type AcademyCheckoutContextRow = {
  is_academy: boolean;
  is_covered: boolean;
  is_verified: boolean;
  offer_version: number | null;
  price_amount_cents: number | null;
  price_currency: string | null;
  price_id: string | null;
  sales_enabled: boolean;
};

/** Current price the checkout validated, or `null` when none was current. */
type ValidatedAcademyPrice = { amountCents: number; currency: string; id: string } | null;

/**
 * Reads the price the checkout validated from its context.
 *
 * @param context - Academy sales settings and current price.
 * @returns The validated price identity, or `null` when no price was current.
 */
function readValidatedPrice(context: AcademyCheckoutContextRow): ValidatedAcademyPrice {
  if (context.price_id === null || context.price_amount_cents === null || context.price_currency === null) {
    return null;
  }

  return { amountCents: context.price_amount_cents, currency: context.price_currency, id: context.price_id };
}

/**
 * Whether the current price differs from the one the buyer saw. A page
 * rendered before the accepted price was sent (`undefined`) is not compared.
 */
function hasPriceChanged(
  context: AcademyCheckoutContextRow,
  acceptedPrice: StartAcademyCheckoutCommand["acceptedPrice"]
): boolean {
  if (acceptedPrice === undefined) {
    return false;
  }

  if (acceptedPrice === null || context.price_amount_cents === null) {
    return acceptedPrice !== null || context.price_amount_cents !== null;
  }

  return (
    context.price_amount_cents !== acceptedPrice.amountCents ||
    context.price_currency !== acceptedPrice.currency
  );
}

/**
 * Rejects a checkout when sales are closed, the offer or its price changed,
 * the buyer is not verified, or the buyer is already covered.
 *
 * @param context - Academy sales settings, current price and buyer facts.
 * @param command - Offer version and price the buyer accepted.
 * @returns The rejection, or `null` when the checkout may proceed.
 */
function findCheckoutContextRejection(
  context: AcademyCheckoutContextRow,
  command: Pick<StartAcademyCheckoutCommand, "acceptedOfferVersion" | "acceptedPrice">
) {
  if (!context.is_academy || !context.sales_enabled) {
    return { status: "sales_closed" as const };
  }

  if (
    Number(context.offer_version) !== command.acceptedOfferVersion ||
    hasPriceChanged(context, command.acceptedPrice)
  ) {
    return { status: "offer_changed" as const };
  }

  if (!context.is_verified) {
    return { status: "not_eligible" as const };
  }

  if (context.is_covered) {
    return { status: "covered" as const };
  }

  return null;
}

/** The buyer's locked live academy subscription. */
type LiveAcademySubscriptionRow = {
  checkout_url: string | null;
  has_creation_claim: boolean;
  id: string;
  mercado_pago_preapproval_id: string | null;
  status: string;
};

type LiveReservationInput = {
  command: StartAcademyCheckoutCommand;
  tribeId: string;
  userId: string;
  validatedPrice: ValidatedAcademyPrice;
};

type LiveReservationResult =
  | { status: "reserved"; subscriptionId: string }
  | { checkoutUrl: string; status: "redirect" }
  | { status: "already_subscribed" | "offer_changed" | "sales_closed" };

/**
 * Maps the local status of a subscription that reached the provider to the
 * renewal the member sees. A recorded cancellation of a live recurrence reads
 * as `canceling` until the provider confirms it.
 *
 * @param status - Local subscription status.
 * @param isCancelRequested - Whether the member asked to cancel it.
 * @returns Member-facing renewal status.
 */
function mapOwnRenewalStatus(status: string, isCancelRequested: boolean): AcademySubscriptionRenewalStatus {
  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending) {
    return ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.pending;
  }

  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.active || status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused) {
    if (isCancelRequested) {
      return ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.canceling;
    }

    return status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.active
      ? ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.active
      : ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.paused;
  }

  return ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.canceled;
}

/** Whether a provider status means the recurrence is canceled. */
function isCanceledProviderStatus(providerStatus: string | null): boolean {
  return mapMercadoPagoSubscriptionStatus(providerStatus).status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled;
}

/** Trace context of a provider call made for one academy subscription. */
function buildTraceContext(
  operationKeyPrefix: string,
  context: Pick<SubscriptionContextRow, "mercado_pago_preapproval_id" | "subscription_id">,
  requestId: string,
  tribeSlug: string | null
): PaymentOperationTraceContext {
  return {
    operationKey: operationKeyPrefix + context.subscription_id,
    preapprovalId: context.mercado_pago_preapproval_id,
    requestId,
    tribeSlug,
  };
}

/** Checkout status of a typed provider failure. */
function toCheckoutFailureStatus(
  failure: AcademySubscriptionProviderError
): "checkout_unresolved" | "integration_unavailable" | "provider_rejected" | "provider_unavailable" {
  return failure.code === ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.outcomeUnconfirmed
    ? "checkout_unresolved"
    : failure.code;
}

/** Cancellation status of a typed provider failure. */
function toCancellationFailureStatus(
  failure: AcademySubscriptionProviderError
): "cancel_unconfirmed" | "integration_unavailable" | "provider_rejected" | "provider_unavailable" {
  return failure.code === ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.outcomeUnconfirmed
    ? "cancel_unconfirmed"
    : failure.code;
}

/** Reconciliation status of a typed provider failure: only a broken integration is not transient. */
function toReconciliationFailureStatus(
  failure: AcademySubscriptionProviderError
): "integration_unavailable" | "provider_unavailable" {
  return failure.code === ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.integrationUnavailable
    ? failure.code
    : ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.providerUnavailable;
}

export class PostgresAcademySubscriptionRepository implements AcademySubscriptionRepository {
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly gateway: AcademySubscriptionGateway,
    private readonly writePaidGrant: AcademyPaidGrantWriter,
    private readonly recordAuditEvent: AcademySubscriptionAuditWriter
  ) {}

  /**
   * Reads the renewal of the member's latest academy subscription that reached
   * the provider. A local reservation without a provider subscription is no
   * renewal: the member never received a checkout, so the page offers the
   * purchase again and the checkout resumes or replaces that reservation.
   *
   * @param query - Normalized tribe slug.
   * @returns Renewal status and whether its last due invoice was rejected.
   */
  async getOwnRenewal({ tribeSlug }: { tribeSlug: string }): Promise<OwnAcademyRenewal> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribe_member_subscriptions.status,
          tribe_member_subscriptions.cancel_requested_at,
          coalesce((
            select subscription_payment_periods.payment_status = ${REJECTED_LEDGER_STATUS}
            from public.subscription_payment_periods
            where subscription_payment_periods.subscription_id = tribe_member_subscriptions.id
              and (
                subscription_payment_periods.debit_at is null
                or subscription_payment_periods.debit_at <= now()
              )
            order by subscription_payment_periods.debit_at desc nulls last,
              subscription_payment_periods.created_at desc
            limit 1
          ), false) as last_payment_rejected
        from public.tribe_member_subscriptions
        inner join public.tribes
          on tribes.id = tribe_member_subscriptions.tribe_id
        where tribes.slug = ${tribeSlug}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
        order by tribe_member_subscriptions.created_at desc
        limit 1
      `);
      const row = (result.rows[0] ?? null) as {
        cancel_requested_at: string | Date | null;
        last_payment_rejected: boolean;
        status: string;
      } | null;

      if (!row) {
        return { lastPaymentRejected: false, status: ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.none };
      }

      return {
        lastPaymentRejected: row.last_payment_rejected,
        status: mapOwnRenewalStatus(row.status, row.cancel_requested_at !== null),
      };
    });
  }

  async startCheckout(command: StartAcademyCheckoutCommand): Promise<StartAcademyCheckoutResult> {
    const firstAttempt = await this.attemptCheckout(command);

    if (firstAttempt.status !== "replace_stale_reservation") {
      return firstAttempt;
    }

    // The provider confirmed it never created the claimed checkout: the stale
    // reservation was canceled, so a single new attempt starts a fresh one.
    const secondAttempt = await this.attemptCheckout(command);

    return secondAttempt.status === "replace_stale_reservation"
      ? { status: "checkout_unresolved" }
      : secondAttempt;
  }

  async cancelOwnRenewal({
    correlationId,
    tribeSlug,
  }: {
    correlationId: string;
    tribeSlug: string;
  }): Promise<CancelAcademyRenewalResult> {
    const operation = ACADEMY_SUBSCRIPTION_PROVIDER_OPERATION.cancelRenewal;
    // Billing stays reachable for blocked members: only ownership is checked.
    const context = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(buildRequestRenewalCancellationStatement(tribeSlug));
      const row = (result.rows[0] ?? null) as CancellationContextRow | null;

      if (row) {
        await this.recordAuditEvent(database, {
          action: ACADEMY_SUBSCRIPTION_AUDIT_ACTION.cancelRequested,
          actorUserId: row.user_id,
          correlationId,
          entityId: row.subscription_id,
          entityType: ACADEMY_SUBSCRIPTION_AUDIT_ENTITY.subscription,
          fromState: null,
          reason: null,
          subjectUserId: row.user_id,
          toState: ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.canceling,
          tribeId: row.tribe_id,
        });
      }

      return row;
    });

    if (!context) {
      return { status: "not_found" };
    }

    const token = await this.resolveTokenOrFailure(context, operation);

    if ("failure" in token) {
      // Nothing reached the provider: undo this request so the member can retry.
      await this.withdrawCancellationRequest(context);

      return { cause: token.failure, status: toCancellationFailureStatus(token.failure) };
    }

    let providerStatus: string;

    try {
      providerStatus = await this.gateway.cancelPreapproval({
        accessToken: token.accessToken,
        preapprovalId: context.mercado_pago_preapproval_id,
        status: "canceled",
        traceContext: buildTraceContext(ACADEMY_OPERATION.cancelKeyPrefix, context, correlationId, tribeSlug),
      });
    } catch (error) {
      return this.resolveCancellationFailure(context, error);
    }

    await this.persistRenewalStatus(context.subscription_id, providerStatus);

    // A provider that answers without cancelling did not confirm it: the request
    // stays recorded and the next reconciliation retries the cancellation.
    return isCanceledProviderStatus(providerStatus)
      ? { status: "canceled" }
      : {
          cause: new AcademySubscriptionProviderError(
            ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.outcomeUnconfirmed,
            operation
          ),
          status: "cancel_unconfirmed",
        };
  }

  async reconcileOwnCoverage({
    correlationId,
    tribeSlug,
  }: {
    correlationId: string;
    tribeSlug: string;
  }): Promise<AcademyCoverageReconciliationResult> {
    const claim = await this.executeWithDatabase(async (database) => {
      // Throttle per subscription: concurrent or repeated self-service calls
      // collapse into one provider reconciliation per window.
      const result = await database.execute(sql`
        with own_subscription as (
          select tribe_member_subscriptions.id
          from public.tribe_member_subscriptions
          inner join public.tribes
            on tribes.id = tribe_member_subscriptions.tribe_id
          where tribes.slug = ${tribeSlug}
            and tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
            and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          order by tribe_member_subscriptions.created_at desc
          limit 1
        ),
        claimed as (
          update public.tribe_member_subscriptions
          set coverage_reconciled_at = now()
          where tribe_member_subscriptions.id = (select id from own_subscription)
            and (
              tribe_member_subscriptions.coverage_reconciled_at is null
              or tribe_member_subscriptions.coverage_reconciled_at
                < now() - make_interval(secs => ${ACADEMY_COVERAGE_RECONCILIATION_THROTTLE_SECONDS})
            )
          returning tribe_member_subscriptions.mercado_pago_preapproval_id
        )
        select
          exists (select 1 from own_subscription) as found,
          (select mercado_pago_preapproval_id from claimed) as preapproval_id
      `);

      return result.rows[0] as { found: boolean; preapproval_id: string | null };
    });

    if (!claim.found) {
      return { appliedInvoices: 0, status: "not_found" };
    }

    if (!claim.preapproval_id) {
      return { appliedInvoices: 0, status: "throttled" };
    }

    return this.reconcileSubscriptionCoverage({
      correlationId,
      providerSubscriptionId: claim.preapproval_id,
      tribeSlug,
    });
  }

  async reconcileSubscriptionCoverage({
    correlationId,
    providerSubscriptionId,
    tribeSlug = null,
  }: {
    correlationId: string;
    providerSubscriptionId: string;
    tribeSlug?: string | null;
  }): Promise<AcademyCoverageReconciliationResult> {
    const operation = ACADEMY_SUBSCRIPTION_PROVIDER_OPERATION.reconcileCoverage;
    const context = await this.readSubscriptionContext(providerSubscriptionId);

    if (!context) {
      return { appliedInvoices: 0, status: "not_found" };
    }

    const token = await this.resolveTokenOrFailure(context, operation);

    if ("failure" in token) {
      return { appliedInvoices: 0, cause: token.failure, status: toReconciliationFailureStatus(token.failure) };
    }

    const traceContext = buildTraceContext(ACADEMY_OPERATION.reconcileKeyPrefix, context, correlationId, tribeSlug);
    let invoices: MercadoPagoAuthorizedPayment[];
    let providerStatus: string | null;

    try {
      [invoices, providerStatus] = await Promise.all([
        this.gateway.searchAuthorizedPayments({ accessToken: token.accessToken, preapprovalId: providerSubscriptionId, traceContext }),
        this.gateway.getPreapprovalStatus({ accessToken: token.accessToken, preapprovalId: providerSubscriptionId, traceContext }),
      ]);
    } catch (error) {
      // Confirmed grants stay until they end.
      const failure = toProviderError(error, operation);

      return { appliedInvoices: 0, cause: failure, status: toReconciliationFailureStatus(failure) };
    }

    providerStatus = await this.completeRecordedCancellation(context, providerStatus, {
      accessToken: token.accessToken,
      traceContext,
    });
    await this.persistRenewalStatus(context.subscription_id, providerStatus);

    let appliedInvoices = 0;

    // Oldest first: the earliest approved invoice anchors the recurrence.
    for (const invoice of [...invoices].sort(compareInvoicesByDebitDate)) {
      if (await this.applyInvoice(context.subscription_id, invoice, correlationId)) {
        appliedInvoices += 1;
      }
    }

    return { appliedInvoices, status: "reconciled" };
  }

  /**
   * Reconciles the recorded invoice and its independently verified payment outcome.
   * The notification selects records only; provider reads determine access, even
   * when the invoice has not yet received a payment refund or dispute update.
   * @param command - Signed payment identifier, optional seller hint, and correlation id.
   * @returns Processing status, or a retry request when an authoritative read fails.
   */
  async handlePaymentWebhook(command: AcademyPaymentWebhookCommand): Promise<AcademyPaymentWebhookResult> {
    const recordedPayments = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select distinct
          tribe_member_subscriptions.id as subscription_id,
          tribe_member_subscriptions.tribe_id,
          tribe_member_subscriptions.user_id,
          tribe_member_subscriptions.mercado_pago_preapproval_id,
          tribe_member_subscriptions.payment_integration_id,
          tribe_member_subscriptions.price_snapshot_amount_cents as amount_cents,
          tribe_member_subscriptions.price_snapshot_currency as currency,
          tribe_member_subscriptions.billing_anchor_at,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          tribe_payment_integrations.provider_account_id,
          subscription_payment_periods.provider_invoice_id
        from public.subscription_payment_periods
        inner join public.tribe_member_subscriptions
          on tribe_member_subscriptions.id = subscription_payment_periods.subscription_id
          and tribe_member_subscriptions.payment_integration_id = subscription_payment_periods.payment_integration_id
          and tribe_member_subscriptions.tribe_id = subscription_payment_periods.tribe_id
        inner join public.tribe_payment_integrations
          on tribe_payment_integrations.id = subscription_payment_periods.payment_integration_id
          and tribe_payment_integrations.tribe_id = subscription_payment_periods.tribe_id
        where subscription_payment_periods.provider_payment_id = ${command.providerPaymentId}
          and subscription_payment_periods.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          and tribe_payment_integrations.provider = ${PAYMENT_PROVIDER}
          and (${command.providerAccountId}::text is null or tribe_payment_integrations.provider_account_id = ${command.providerAccountId})
          and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
      `);
      return result.rows as Array<SubscriptionContextRow & { provider_account_id: string; provider_invoice_id: string }>;
    });

    if (recordedPayments.length === 0) return { status: "ignored" };

    let hadRetryableFailure = false;
    let processedPayment = false;
    for (const recordedPayment of recordedPayments) {
      const accessToken = await this.resolveToken(recordedPayment).catch(() => null);
      if (!accessToken) { hadRetryableFailure = true; continue; }
      let invoice: MercadoPagoAuthorizedPayment | null;
      let payment: MercadoPagoPayment | null;
      try {
        [invoice, payment] = await Promise.all([
          this.gateway.getAuthorizedPayment({ accessToken, authorizedPaymentId: recordedPayment.provider_invoice_id }),
          this.gateway.getPayment({ accessToken, paymentId: command.providerPaymentId }),
        ]);
      } catch {
        hadRetryableFailure = true;
        continue;
      }
      if (!invoice || !payment) { hadRetryableFailure = true; continue; }
      if (invoice.id !== recordedPayment.provider_invoice_id ||
        invoice.preapprovalId !== recordedPayment.mercado_pago_preapproval_id ||
        invoice.paymentId !== command.providerPaymentId || payment.id !== command.providerPaymentId ||
        payment.collectorId !== recordedPayment.provider_account_id) continue;

      const updatedInvoice = { ...invoice, ...mergeAcademyInvoicePaymentState(toVerifiedInvoice(invoice), payment) };
      await this.applyInvoice(recordedPayment.subscription_id, updatedInvoice, command.correlationId);
      processedPayment = true;
    }
    if (hadRetryableFailure) return { status: "retryable" };
    return { status: processedPayment ? "processed" : "ignored" };
  }

  async handleAuthorizedPaymentWebhook(
    command: AcademyAuthorizedPaymentWebhookCommand
  ): Promise<AcademyAuthorizedPaymentWebhookResult> {
    // Invoice notifications omit user_id in the real provider contract.
    // Restrict discovery to integrations with local academy subscriptions;
    // authoritative invoice ownership and local integration binding remain mandatory.
    const integrations = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribe_payment_integrations.id as payment_integration_id,
          tribe_payment_integrations.tribe_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          exists (
            select 1 from public.tribe_member_subscriptions
            where tribe_member_subscriptions.payment_integration_id = tribe_payment_integrations.id
              and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
              and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
              and tribe_member_subscriptions.mercado_pago_preapproval_id is null
          ) as has_unlinked_checkout
        from public.tribe_payment_integrations
        where tribe_payment_integrations.provider = ${PAYMENT_PROVIDER}
          and (${command.providerAccountId}::text is null or tribe_payment_integrations.provider_account_id = ${command.providerAccountId})
          and exists (
            select 1 from public.tribe_member_subscriptions
            where tribe_member_subscriptions.payment_integration_id = tribe_payment_integrations.id
              and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          )
        order by exists (
          select 1 from public.subscription_payment_periods
          where subscription_payment_periods.payment_integration_id = tribe_payment_integrations.id
            and subscription_payment_periods.provider_invoice_id = ${command.resourceId}
        ) desc
      `);

      return result.rows as Array<{ has_unlinked_checkout: boolean } & Pick<
        SubscriptionContextRow,
        "access_token" | "payment_integration_id" | "refresh_token" | "token_expires_at" | "tribe_id"
      >>;
    });

    let hadProviderFailure = false;
    for (const integration of integrations) {
      const accessToken = await this.resolveToken(integration).catch(() => null);

      if (!accessToken) {
        hadProviderFailure = true;
        continue;
      }

      let invoice: MercadoPagoAuthorizedPayment | null;

      try {
        invoice = await this.gateway.getAuthorizedPayment({
          accessToken,
          authorizedPaymentId: command.resourceId,
        });
      } catch {
        hadProviderFailure = true;
        continue;
      }

      if (!invoice?.preapprovalId) {
        continue;
      }

      const context = await this.readSubscriptionContext(invoice.preapprovalId);

      if (!context) {
        hadProviderFailure ||= integration.has_unlinked_checkout;
        continue;
      }
      if (context.payment_integration_id !== integration.payment_integration_id) {
        continue;
      }

      const reconciliation = await this.reconcileSubscriptionCoverage({
        correlationId: command.correlationId,
        providerSubscriptionId: invoice.preapprovalId,
      });

      // A broken seller integration may be reconnected: the provider redelivers until then.
      return {
        status:
          reconciliation.status === "provider_unavailable" ||
          reconciliation.status === "integration_unavailable"
            ? "retryable"
            : "processed",
      };
    }

    return { status: hadProviderFailure ? "retryable" : "ignored" };
  }

  /**
   * Runs one checkout attempt: reserve (or resume) the reservation, then create
   * or recover its provider subscription under the durable creation claim.
   *
   * @param command - Accepted offer and price, correlation and tribe.
   * @returns The checkout result, or the request to retry once after a stale reservation was replaced.
   */
  private async attemptCheckout(
    command: StartAcademyCheckoutCommand
  ): Promise<StartAcademyCheckoutResult | { status: "replace_stale_reservation" }> {
    const operation = ACADEMY_SUBSCRIPTION_PROVIDER_OPERATION.startCheckout;
    const reservation = await this.reserveCheckout(command);

    if (reservation.status !== "reserved") {
      return reservation;
    }

    const row = reservation.row;

    if (row.mercado_pago_preapproval_id && row.checkout_url) {
      return { checkoutUrl: row.checkout_url, status: "redirect" };
    }

    if (!row.payer_email) {
      return {
        cause: new AcademySubscriptionProviderError(ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.providerRejected, operation),
        status: "provider_rejected",
      };
    }

    // Built before claiming: a configuration failure here never leaves a claim behind.
    const backUrl = buildAcademyBackUrl(command.tribeSlug);
    const token = await this.resolveTokenOrFailure(row, operation);

    if ("failure" in token) {
      return { cause: token.failure, status: toCheckoutFailureStatus(token.failure) };
    }

    const provider = {
      accessToken: token.accessToken,
      externalReference: `${ACADEMY_OPERATION.externalReferencePrefix}${row.subscription_id}`,
      traceContext: {
        operationKey: `${ACADEMY_OPERATION.checkoutKeyPrefix}${row.subscription_id}`,
        providerPlanId: row.provider_plan_id,
        requestId: command.correlationId,
        tribeSlug: command.tribeSlug,
      },
    };

    // The durable local claim protects creation even when the provider ignores its header.
    const claimed = await this.claimProviderCreation(row.subscription_id);

    if (!claimed) {
      return this.recoverClaimedCheckout(row, provider, command.correlationId);
    }

    // A concurrent checkout may have refreshed the snapshot before the claim:
    // the provider receives the contract the claim protects, never the one read earlier.
    const creationToken = claimed.payment_integration_id === row.payment_integration_id
      ? token
      : await this.resolveTokenOrFailure(claimed, operation);

    if ("failure" in creationToken) {
      // Nothing reached the provider: release the claim so a retry may create it.
      await this.releaseProviderCreationClaim(row.subscription_id);

      return { cause: creationToken.failure, status: toCheckoutFailureStatus(creationToken.failure) };
    }

    const traceContext = { ...provider.traceContext, providerPlanId: claimed.provider_plan_id };
    let providerCheckout: { checkoutUrl: string; providerSubscriptionId: string };

    try {
      providerCheckout = await this.gateway.createPreapproval({
        accessToken: creationToken.accessToken,
        amountCents: claimed.amount_cents,
        backUrl,
        currency: claimed.currency,
        externalReference: provider.externalReference,
        idempotencyKey: traceContext.operationKey,
        payerEmail: row.payer_email,
        reason: claimed.price_name,
        traceContext,
      });
    } catch (error) {
      const failure = toProviderError(error, operation);

      // Release only a definite rejection, never a timeout or upstream failure:
      // the provider created nothing, so a corrected retry may create it.
      if (failure.code !== ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.providerUnavailable) {
        await this.releaseProviderCreationClaim(row.subscription_id);

        return { cause: failure, status: toCheckoutFailureStatus(failure) };
      }

      return { cause: failure, status: "checkout_unresolved" };
    }

    return this.linkCheckout({
      checkoutUrl: providerCheckout.checkoutUrl,
      providerSubscriptionId: providerCheckout.providerSubscriptionId,
      subscriptionId: row.subscription_id,
      tribeId: row.tribe_id,
    });
  }

  /**
   * Resolves a reservation whose provider creation was already claimed: links
   * the checkout the provider has for its reference, or, when the provider
   * confirms it has none and the claim is old enough that no creation can
   * still be in flight, replaces the reservation.
   */
  private async recoverClaimedCheckout(
    row: ReservationRow,
    provider: { accessToken: string; externalReference: string; traceContext: PaymentOperationTraceContext },
    correlationId: string
  ): Promise<StartAcademyCheckoutResult | { status: "replace_stale_reservation" }> {
    const operation = ACADEMY_SUBSCRIPTION_PROVIDER_OPERATION.startCheckout;
    let recovered: MercadoPagoCheckoutReferenceResult;

    try {
      recovered = await this.gateway.findCheckoutByReference(provider);
    } catch (error) {
      const failure = toProviderError(error, operation);

      return {
        cause: failure,
        status:
          failure.code === ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.integrationUnavailable
            ? failure.code
            : "checkout_unresolved",
      };
    }

    if (recovered.status === "found") {
      return this.linkCheckout({
        checkoutUrl: recovered.checkoutUrl,
        providerSubscriptionId: recovered.providerSubscriptionId,
        subscriptionId: row.subscription_id,
        tribeId: row.tribe_id,
      });
    }

    if (recovered.status === "absent" && (await this.replaceStaleReservation(row, correlationId))) {
      return { status: "replace_stale_reservation" };
    }

    return {
      cause: new AcademySubscriptionProviderError(ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.outcomeUnconfirmed, operation),
      status: "checkout_unresolved",
    };
  }

  /**
   * Takes the durable creation claim of a reservation and reads, in the same
   * transaction, the snapshot it protects. The reservation row lock serializes
   * the claim with a concurrent refresh of an unclaimed reservation: a refresh
   * that committed first is read here, and a later one sees the claim and
   * keeps the snapshot.
   *
   * @returns The protected reservation, or null when the claim already exists.
   */
  private async claimProviderCreation(subscriptionId: string): Promise<ReservationRow | null> {
    return this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        select tribe_member_subscriptions.id
        from public.tribe_member_subscriptions
        where tribe_member_subscriptions.id = ${subscriptionId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
        for update
      `);
      const result = await database.execute(sql`
        insert into public.subscription_idempotency_operations
          (operation_key, operation_type, tribe_id, user_id, payload_hash, response_body)
        select ${ACADEMY_OPERATION.creationKeyPrefix + subscriptionId}, ${ACADEMY_OPERATION.creationType},
          tribe_id, user_id, id::text, '{}'::jsonb
        from public.tribe_member_subscriptions
        where id = ${subscriptionId} and user_id = public.current_app_user_id()
        on conflict (operation_key) do nothing returning id
      `);

      if (result.rows.length === 0) {
        return null;
      }

      const protectedResult = await database.execute(buildReservationStatement(subscriptionId));

      return protectedResult.rows[0] as ReservationRow;
    });
  }

  /** Releases the creation claim after a definite provider rejection. */
  private async releaseProviderCreationClaim(subscriptionId: string): Promise<void> {
    await this.executeWithDatabase((database) => database.execute(sql`
      delete from public.subscription_idempotency_operations
      where operation_key = ${ACADEMY_OPERATION.creationKeyPrefix + subscriptionId}
        and user_id = public.current_app_user_id()
    `));
  }

  /**
   * Cancels an unlinked reservation whose creation claim is stale, releasing
   * the claim, in one transaction. The reservation row lock serializes it with
   * a late link, which only links a pending reservation. A provider
   * subscription that a lagging search missed can never be paid: its checkout
   * URL was never handed to the member.
   *
   * @param row - Reservation without a provider subscription.
   * @param correlationId - Request correlation for the audit.
   * @returns Whether the reservation was replaced (canceled) by this call.
   */
  private async replaceStaleReservation(row: ReservationRow, correlationId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const locked = await database.execute(sql`
        select tribe_member_subscriptions.user_id
        from public.tribe_member_subscriptions
        where tribe_member_subscriptions.id = ${row.subscription_id}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is null
        for update
      `);
      const reservation = (locked.rows[0] ?? null) as { user_id: string } | null;

      if (!reservation) {
        return false;
      }

      const released = await database.execute(sql`
        delete from public.subscription_idempotency_operations
        where operation_key = ${ACADEMY_OPERATION.creationKeyPrefix + row.subscription_id}
          and created_at < now() - make_interval(secs => ${ACADEMY_CHECKOUT_CREATION_CLAIM_STALE_SECONDS})
        returning id
      `);

      if (released.rows.length === 0) {
        return false;
      }

      await database.execute(sql`
        update public.tribe_member_subscriptions
        set status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled},
            status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive},
            updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${row.subscription_id}
      `);
      await this.recordAuditEvent(database, {
        action: ACADEMY_SUBSCRIPTION_AUDIT_ACTION.checkoutReplaced,
        actorUserId: reservation.user_id,
        correlationId,
        entityId: row.subscription_id,
        entityType: ACADEMY_SUBSCRIPTION_AUDIT_ENTITY.subscription,
        fromState: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
        reason: STALE_CHECKOUT_REPLACEMENT_REASON,
        subjectUserId: reservation.user_id,
        toState: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
        tribeId: row.tribe_id,
      });

      return true;
    });
  }

  private async reserveCheckout(
    command: StartAcademyCheckoutCommand
  ): Promise<
    | { row: ReservationRow; status: "reserved" }
    | Exclude<StartAcademyCheckoutResult, { status: "redirect" }>
    | { checkoutUrl: string; status: "redirect" }
  > {
    return this.executeWithDatabase(async (database) => {
      const tribeResult = await database.execute(sql`
        select tribes.id from public.tribes where tribes.slug = ${command.tribeSlug} limit 1
      `);
      const tribeId = (tribeResult.rows[0] as { id: string } | undefined)?.id;

      if (!tribeId) {
        return { status: "not_found" as const };
      }

      // Lock the buyer membership: a concurrent block or removal either waits
      // for this reservation or is seen by it.
      const memberResult = await database.execute(sql`
        select tribe_members.status, tribe_members.user_id
        from public.tribe_members
        where tribe_members.tribe_id = ${tribeId}
          and tribe_members.user_id = public.current_app_user_id()
        for share of tribe_members
      `);
      const member = (memberResult.rows[0] ?? null) as { status: string; user_id: string } | null;

      if (!member || (member.status !== "active" && member.status !== "muted")) {
        return { status: "forbidden" as const };
      }

      const contextResult = await database.execute(buildAcademyCheckoutContextStatement(tribeId, member.user_id));
      const context = contextResult.rows[0] as AcademyCheckoutContextRow;
      const rejection = findCheckoutContextRejection(context, command);

      if (rejection) {
        return rejection;
      }

      const reserved = await this.reserveLiveSubscription(database, {
        command,
        tribeId,
        userId: member.user_id,
        validatedPrice: readValidatedPrice(context),
      });

      if (reserved.status !== "reserved") {
        return reserved;
      }

      const rowResult = await database.execute(buildReservationStatement(reserved.subscriptionId));

      return { row: rowResult.rows[0] as ReservationRow, status: "reserved" as const };
    });
  }

  /**
   * Reuses the buyer's live academy subscription or inserts a new reservation.
   * A concurrent checkout of the same buyer that inserted first (unique live
   * subscription) is reread and reused instead of reading as closed sales.
   */
  private async reserveLiveSubscription(
    database: RequestDatabase,
    input: LiveReservationInput
  ): Promise<LiveReservationResult> {
    const first = await this.reserveOnce(database, input);

    if (first.status !== "conflict") {
      return first;
    }

    // A new statement sees the reservation the concurrent checkout committed.
    const second = await this.reserveOnce(database, input);

    // Two conflicts in a row mean the live row keeps changing under this checkout.
    return second.status === "conflict" ? { status: "already_subscribed" } : second;
  }

  /** Reuses the locked live subscription or inserts a reservation once. */
  private async reserveOnce(
    database: RequestDatabase,
    input: LiveReservationInput
  ): Promise<LiveReservationResult | { status: "conflict" }> {
    const liveResult = await database.execute(buildLockedLiveAcademySubscriptionStatement(input.tribeId, input.userId));
    const live = (liveResult.rows[0] ?? null) as LiveAcademySubscriptionRow | null;

    return live
      ? this.reuseLiveSubscription(database, live, input)
      : this.insertReservation(database, input);
  }

  /**
   * Resumes the buyer's live academy subscription. An unlinked reservation that
   * never reached the provider is refreshed with the accepted offer and the
   * validated price, so the checkout never freezes conditions the member did not see.
   */
  private async reuseLiveSubscription(
    database: RequestDatabase,
    live: LiveAcademySubscriptionRow,
    { command, tribeId, validatedPrice }: LiveReservationInput
  ): Promise<LiveReservationResult> {
    if (live.status !== TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending) {
      return { status: "already_subscribed" };
    }

    if (live.mercado_pago_preapproval_id && live.checkout_url) {
      return { checkoutUrl: live.checkout_url, status: "redirect" };
    }

    if (!live.mercado_pago_preapproval_id && !live.has_creation_claim) {
      // The claim is checked again here: this statement runs after the row lock,
      // so it sees a claim committed while this checkout waited for that lock.
      const refreshResult = await database.execute(sql`
        with ${buildValidatedAcademyPriceCtes(tribeId, validatedPrice)},
        creation_claim as (
          select 1
          from public.subscription_idempotency_operations
          where subscription_idempotency_operations.operation_key = ${ACADEMY_OPERATION.creationKeyPrefix + live.id}
        ),
        refreshed as (
          update public.tribe_member_subscriptions
          set price_id = validated_academy_price.id,
              payment_integration_id = validated_academy_price.payment_integration_id,
              price_snapshot_name = validated_academy_price.name,
              price_snapshot_amount_cents = validated_academy_price.amount_cents,
              price_snapshot_currency = validated_academy_price.currency,
              price_snapshot_frequency = validated_academy_price.frequency,
              price_snapshot_provider_plan_id = validated_academy_price.mercado_pago_preapproval_plan_id,
              offer_version_snapshot = ${command.acceptedOfferVersion},
              terms_accepted_at = now(),
              updated_at = timezone('utc', now())
          from validated_academy_price
          where tribe_member_subscriptions.id = ${live.id}
            and not exists (select 1 from creation_claim)
          returning tribe_member_subscriptions.id
        )
        select
          exists (select 1 from refreshed) as is_refreshed,
          exists (select 1 from creation_claim) as has_creation_claim,
          exists (select 1 from current_academy_price) as has_current_price
      `);
      const refresh = refreshResult.rows[0] as { has_creation_claim: boolean; has_current_price: boolean; is_refreshed: boolean };

      // A claimed reservation keeps its snapshot and resumes through the claim recovery.
      if (!refresh.is_refreshed && !refresh.has_creation_claim) {
        // A current price other than the validated one changed after the buyer accepted it.
        return { status: refresh.has_current_price ? "offer_changed" : "sales_closed" };
      }
    }

    return { status: "reserved", subscriptionId: live.id };
  }

  private async insertReservation(
    database: RequestDatabase,
    { command, tribeId, userId, validatedPrice }: LiveReservationInput
  ): Promise<LiveReservationResult | { status: "conflict" }> {
    // Freeze the accepted conditions: later catalog edits never change them.
    const result = await database.execute(sql`
      with ${buildValidatedAcademyPriceCtes(tribeId, validatedPrice)},
      inserted as (
        insert into public.tribe_member_subscriptions (
          tribe_id,
          user_id,
          price_id,
          payment_integration_id,
          product_key,
          status,
          status_reason,
          price_snapshot_name,
          price_snapshot_amount_cents,
          price_snapshot_currency,
          price_snapshot_frequency,
          price_snapshot_provider_plan_id,
          offer_version_snapshot,
          terms_accepted_at
        )
        select
          ${tribeId},
          ${userId},
          validated_academy_price.id,
          validated_academy_price.payment_integration_id,
          ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy},
          ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
          ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none},
          validated_academy_price.name,
          validated_academy_price.amount_cents,
          validated_academy_price.currency,
          validated_academy_price.frequency,
          validated_academy_price.mercado_pago_preapproval_plan_id,
          ${command.acceptedOfferVersion},
          now()
        from validated_academy_price
        on conflict do nothing
        returning id
      )
      select
        (select id from inserted) as id,
        exists (select 1 from current_academy_price) as has_current_price,
        exists (select 1 from validated_academy_price) as has_validated_price
    `);
    const row = result.rows[0] as { has_current_price: boolean; has_validated_price: boolean; id: string | null };

    if (!row.id) {
      if (!row.has_current_price) {
        return { status: "sales_closed" };
      }

      // A current price other than the validated one changed after the buyer accepted it;
      // with the validated one, a concurrent checkout of the buyer inserted first.
      return { status: row.has_validated_price ? "conflict" : "offer_changed" };
    }

    await this.recordAuditEvent(database, {
      action: ACADEMY_SUBSCRIPTION_AUDIT_ACTION.checkoutReserved,
      actorUserId: userId,
      correlationId: command.correlationId,
      entityId: row.id,
      entityType: ACADEMY_SUBSCRIPTION_AUDIT_ENTITY.subscription,
      fromState: null,
      reason: null,
      subjectUserId: userId,
      toState: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      tribeId,
    });

    return { status: "reserved", subscriptionId: row.id };
  }

  private async linkCheckout(input: {
    checkoutUrl: string;
    providerSubscriptionId: string;
    subscriptionId: string;
    tribeId: string;
  }): Promise<StartAcademyCheckoutResult> {
    return this.executeWithDatabase(async (database) => {
      // The unique index on mercado_pago_preapproval_id keeps a provider id
      // bound to exactly one reservation (no attaching someone else's id). A
      // reservation replaced meanwhile is no longer pending and is never linked.
      const linked = await database.execute(sql`
        update public.tribe_member_subscriptions
        set mercado_pago_preapproval_id = ${input.providerSubscriptionId},
            updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${input.subscriptionId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          and (
            tribe_member_subscriptions.mercado_pago_preapproval_id is null
            or tribe_member_subscriptions.mercado_pago_preapproval_id = ${input.providerSubscriptionId}
          )
        returning tribe_member_subscriptions.id
      `);

      if (linked.rows.length === 0) {
        return {
          cause: new AcademySubscriptionProviderError(
            ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.outcomeUnconfirmed,
            ACADEMY_SUBSCRIPTION_PROVIDER_OPERATION.startCheckout
          ),
          status: "checkout_unresolved" as const,
        };
      }

      await database.execute(sql`
        insert into public.subscription_idempotency_operations (
          operation_key, operation_type, tribe_id, user_id, payload_hash, response_body
        )
        values (
          ${ACADEMY_OPERATION.checkoutKeyPrefix + input.subscriptionId},
          ${ACADEMY_OPERATION.checkoutType},
          ${input.tribeId},
          public.current_app_user_id(),
          ${input.subscriptionId},
          jsonb_build_object('checkoutUrl', ${input.checkoutUrl}::text)
        )
        on conflict (operation_key) do update
          set response_body = excluded.response_body
      `);

      return { checkoutUrl: input.checkoutUrl, status: "redirect" as const };
    });
  }

  /**
   * Resolves the seller token, or the typed failure that explains why there is none.
   *
   * @param context - Stored seller tokens of the subscription integration.
   * @param operation - Academy operation that needs the token.
   * @returns The access token, or the failure (no token, rejected refresh, missing configuration, transient).
   */
  private async resolveTokenOrFailure(
    context: Pick<
      SubscriptionContextRow,
      "access_token" | "payment_integration_id" | "refresh_token" | "token_expires_at" | "tribe_id"
    >,
    operation: AcademySubscriptionProviderOperation
  ): Promise<{ accessToken: string } | { failure: AcademySubscriptionProviderError }> {
    try {
      const accessToken = await this.resolveToken(context);

      return accessToken ? { accessToken } : { failure: missingTokenError(operation) };
    } catch (error) {
      return { failure: toProviderError(error, operation) };
    }
  }

  /**
   * Clears a cancellation request this attempt recorded and could not send, so
   * the member can retry. An earlier request stays recorded: it may already
   * have reached the provider, and the reconciliation keeps completing it.
   */
  private async withdrawCancellationRequest(context: CancellationContextRow): Promise<void> {
    if (!context.is_new_cancellation_request) {
      return;
    }

    await this.executeWithDatabase((database) =>
      database.execute(sql`
        update public.tribe_member_subscriptions
        set cancel_requested_at = null
        where id = ${context.subscription_id}
          and status <> ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled}
      `)
    );
  }

  /**
   * Classifies a failed cancellation call. A missing preapproval is already
   * gone at the provider (recorded as canceled); a definite rejection undoes
   * the request this attempt recorded; a transient failure may have applied it, so the request stays
   * recorded for the reconciliation to complete.
   */
  private async resolveCancellationFailure(
    context: CancellationContextRow,
    error: unknown
  ): Promise<CancelAcademyRenewalResult> {
    if (isMissingPreapprovalError(error)) {
      await this.persistRenewalStatus(context.subscription_id, null);

      return { status: "canceled" };
    }

    const failure = toProviderError(error, ACADEMY_SUBSCRIPTION_PROVIDER_OPERATION.cancelRenewal);

    if (failure.code === ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE.providerUnavailable) {
      return { cause: failure, status: "cancel_unconfirmed" };
    }

    await this.withdrawCancellationRequest(context);

    return { cause: failure, status: toCancellationFailureStatus(failure) };
  }

  /**
   * Sends again a cancellation the member requested when the provider still
   * runs the recurrence (the earlier request was never confirmed). A failure
   * keeps the request recorded for the next reconciliation.
   *
   * @returns The provider status to persist.
   */
  private async completeRecordedCancellation(
    context: SubscriptionContextRow,
    providerStatus: string | null,
    provider: { accessToken: string; traceContext: PaymentOperationTraceContext }
  ): Promise<string | null> {
    const isLive = LIVE_RENEWAL_SUBSCRIPTION_STATUSES.has(mapMercadoPagoSubscriptionStatus(providerStatus).status);

    if (!context.cancel_requested_at || !isLive) {
      return providerStatus;
    }

    return this.gateway
      .cancelPreapproval({
        accessToken: provider.accessToken,
        preapprovalId: context.mercado_pago_preapproval_id,
        status: "canceled",
        traceContext: provider.traceContext,
      })
      .catch(() => providerStatus);
  }

  private async readSubscriptionContext(
    providerSubscriptionId: string
  ): Promise<SubscriptionContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribe_member_subscriptions.id as subscription_id,
          tribe_member_subscriptions.tribe_id,
          tribe_member_subscriptions.user_id,
          tribe_member_subscriptions.mercado_pago_preapproval_id,
          tribe_member_subscriptions.payment_integration_id,
          tribe_member_subscriptions.price_snapshot_amount_cents as amount_cents,
          tribe_member_subscriptions.price_snapshot_currency as currency,
          tribe_member_subscriptions.billing_anchor_at,
          tribe_member_subscriptions.cancel_requested_at,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from public.tribe_member_subscriptions
        inner join public.tribe_payment_integrations
          on tribe_payment_integrations.id = tribe_member_subscriptions.payment_integration_id
          and tribe_payment_integrations.tribe_id = tribe_member_subscriptions.tribe_id
        where tribe_member_subscriptions.mercado_pago_preapproval_id = ${providerSubscriptionId}
          and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
        limit 1
      `);

      return (result.rows[0] ?? null) as SubscriptionContextRow | null;
    });
  }

  private async resolveToken(
    context: Pick<
      SubscriptionContextRow,
      "access_token" | "payment_integration_id" | "refresh_token" | "token_expires_at" | "tribe_id"
    >
  ): Promise<string | null> {
    return resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.gateway.refreshAccessToken,
      storedToken: {
        accessToken: context.access_token,
        paymentIntegrationId: context.payment_integration_id,
        refreshToken: context.refresh_token,
        tokenExpiresAt: context.token_expires_at,
        tribeId: context.tribe_id,
      },
    });
  }

  /**
   * Mirrors the remote recurrence state (renewal only, never access).
   */
  private async persistRenewalStatus(
    subscriptionId: string,
    providerStatus: string | null
  ): Promise<void> {
    const mapped = mapMercadoPagoSubscriptionStatus(providerStatus);

    await this.executeWithDatabase((database) =>
      database.execute(sql`
        update public.tribe_member_subscriptions
        set status = ${mapped.status},
            status_reason = ${mapped.statusReason},
            updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${subscriptionId}
          and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          and tribe_member_subscriptions.status is distinct from ${mapped.status}
      `)
    );
  }

  /**
   * Creates the paid grant of a covered cycle (anchoring the contract on its
   * first invoice) or revokes the grant of a reversed payment.
   *
   * @param database - Transaction of the invoice.
   * @param input - Contract, decision, grant already linked to the period, and invoice.
   * @returns The grant to link to the ledger period.
   */
  private async applyGrantDecision(
    database: RequestDatabase,
    {
      contract,
      decision,
      existingGrantId,
      providerInvoice,
    }: {
      contract: SubscriptionContextRow;
      decision: Extract<AcademyInvoiceDecision, { kind: "record" }>;
      existingGrantId: string | null;
      providerInvoice: MercadoPagoAuthorizedPayment;
    }
  ): Promise<string | null> {
    let grantId = existingGrantId;

    if (decision.grantAction === "create" && decision.serviceInterval) {
      const grant = await this.writePaidGrant(database, {
        createdBy: null,
        endsAt: decision.serviceInterval.endsAt,
        sourceKey: `${ACADEMY_OPERATION.invoiceSourceKeyPrefix}${contract.payment_integration_id}:${providerInvoice.id}`,
        sourceType: PAID_GRANT_SOURCE,
        startsAt: decision.serviceInterval.startsAt,
        tribeId: contract.tribe_id,
        userId: contract.user_id,
      });
      grantId = grant.grantId;

      if (!contract.billing_anchor_at && decision.billingAnchorAt) {
        await database.execute(sql`
          update public.tribe_member_subscriptions
          set billing_anchor_at = ${decision.billingAnchorAt}
          where id = ${contract.subscription_id}
            and billing_anchor_at is null
        `);
      }
    }

    if (decision.grantAction === "revoke" && grantId) {
      await database.execute(sql`
        update public.member_access_grants
        set revoked_at = now()
        where id = ${grantId}
          and revoked_at is null
      `);
    }

    return grantId;
  }

  /**
   * Applies one invoice atomically. Returns whether the ledger changed.
   */
  private async applyInvoice(
    subscriptionId: string,
    providerInvoice: MercadoPagoAuthorizedPayment,
    correlationId: string
  ): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const contractResult = await database.execute(buildLockedSubscriptionContractStatement(subscriptionId));
      const contract = contractResult.rows[0] as SubscriptionContextRow;
      const existingResult = await database.execute(buildLockedPaymentPeriodStatement(contract, providerInvoice));
      const existing = (existingResult.rows[0] ?? null) as {
        grant_id: string | null;
        id: string;
        payment_status: AcademyLedgerPaymentStatus;
        provider_last_modified_at: string | Date | null;
      } | null;
      const decision = decideAcademyInvoiceEffect({
        contract: {
          amountCents: contract.amount_cents,
          billingAnchorAt: toOptionalDate(contract.billing_anchor_at),
          currency: contract.currency,
          providerSubscriptionId: contract.mercado_pago_preapproval_id,
        },
        existing: existing
          ? {
              paymentStatus: existing.payment_status,
              providerLastModifiedAt: toOptionalDate(existing.provider_last_modified_at),
            }
          : null,
        invoice: toVerifiedInvoice(providerInvoice),
      });

      if (decision.kind === "ignore") {
        return false;
      }

      // Same state already applied (repeated delivery or reconciliation):
      // nothing changes, and the paid grant already exists when due.
      if (
        existing?.payment_status === decision.ledgerStatus &&
        (decision.grantAction !== "create" || existing.grant_id !== null)
      ) {
        return false;
      }

      const grantId = await this.applyGrantDecision(database, {
        contract,
        decision,
        existingGrantId: existing?.grant_id ?? null,
        providerInvoice,
      });

      const ledgerResult = await database.execute(buildRecordPaymentPeriodStatement({
        contract,
        decision,
        grantId,
        providerInvoice,
      }));
      const periodId = (ledgerResult.rows[0] as { id: string }).id;

      await this.recordAuditEvent(database, {
        action: ACADEMY_SUBSCRIPTION_AUDIT_ACTION.paymentRecorded,
        actorUserId: null,
        correlationId,
        entityId: periodId,
        entityType: ACADEMY_SUBSCRIPTION_AUDIT_ENTITY.paymentPeriod,
        fromState: existing?.payment_status ?? null,
        reason: decision.reviewReason,
        subjectUserId: contract.user_id,
        toState: decision.ledgerStatus,
        tribeId: contract.tribe_id,
      });

      return true;
    });
  }
}
