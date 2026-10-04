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

import { sql } from "drizzle-orm";
import { MercadoPagoRequestError, type MercadoPagoCheckoutReferenceInput } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";

import {
  ACADEMY_COVERAGE_RECONCILIATION_THROTTLE_SECONDS,
  ACADEMY_SUBSCRIPTION_RENEWAL_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
  TRIBE_SUBSCRIPTION_PRODUCT_KEY,
  type AcademySubscriptionRenewalStatus,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  AcademyAuthorizedPaymentWebhookCommand,
  AcademyAuthorizedPaymentWebhookResult,
  AcademyCoverageReconciliationResult,
  AcademyPaymentWebhookCommand,
  AcademyPaymentWebhookResult,
  AcademySubscriptionRepository,
  CancelAcademyRenewalResult,
  StartAcademyCheckoutCommand,
  StartAcademyCheckoutResult,
} from "@/src/modules/subscriptions/domain/repositories/academy-subscription-repository";
import {
  decideAcademyInvoiceEffect,
  mergeAcademyInvoicePaymentState,
  type AcademyLedgerPaymentStatus,
  type VerifiedAcademyInvoice,
} from "@/src/modules/subscriptions/domain/services/academy-invoice-policy";
import {
  resolveMercadoPagoAccessToken,
  type MercadoPagoAccessTokenRefresher,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";
import type {
  MercadoPagoAuthorizedPayment,
  MercadoPagoAuthorizedPaymentInput,
  MercadoPagoAuthorizedPaymentSearchInput,
  MercadoPagoPayment,
  MercadoPagoPaymentInput,
  MercadoPagoPreapprovalStatusInput,
  MercadoPagoPendingSubscriptionInput,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import { mapMercadoPagoSubscriptionStatus } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-status-mapper";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
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
export type AcademySubscriptionAuditWriter = (
  database: RequestDatabase,
  event: {
    action: string;
    actorUserId: string | null;
    correlationId: string | null;
    entityId: string;
    entityType: string;
    fromState: string | null;
    reason: string | null;
    subjectUserId: string | null;
    toState: string | null;
    tribeId: string;
  }
) => Promise<void>;

export type AcademySubscriptionGateway = {
  findCheckoutByReference(input: MercadoPagoCheckoutReferenceInput): Promise<{ checkoutUrl: string; providerSubscriptionId: string } | null>;
  cancelPreapproval(input: {
    accessToken: string;
    preapprovalId: string;
    status: "canceled";
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

export const ACADEMY_SUBSCRIPTION_AUDIT_ACTION = {
  cancelRequested: "academy_renewal_cancel_requested",
  checkoutReserved: "academy_checkout_reserved",
  paymentRecorded: "academy_payment_recorded",
} as const;

const ACADEMY_SUBSCRIPTION_AUDIT_ENTITY = {
  paymentPeriod: "subscription_payment_period",
  subscription: "tribe_member_subscription",
} as const;

const ACADEMY_OPERATION = {
  creationKeyPrefix: "academy-provider-creation:",
  creationType: "create_academy_provider_subscription",
  checkoutKeyPrefix: "academy-checkout:",
  checkoutType: "start_academy_subscription",
  externalReferencePrefix: "tutribu:academy-subscription:",
  invoiceSourceKeyPrefix: "invoice:",
} as const;

const PAYMENT_PROVIDER = "mercado_pago";
const PAID_GRANT_SOURCE = "subscription_payment";
const PREAPPROVAL_QUERY_PARAM = "preapproval_id";
const CHECKOUT_REJECTION_HTTP_STATUS = { badRequest: 400, unauthorized: 401, forbidden: 403, notFound: 404, unprocessable: 422 } as const;
const DEFINITE_CHECKOUT_REJECTION_STATUSES: ReadonlySet<number> = new Set(Object.values(CHECKOUT_REJECTION_HTTP_STATUS));

type SubscriptionContextRow = {
  access_token: string | null;
  amount_cents: number;
  billing_anchor_at: string | Date | null;
  currency: string;
  mercado_pago_preapproval_id: string;
  payment_integration_id: string;
  refresh_token: string | null;
  subscription_id: string;
  token_expires_at: string | Date | null;
  tribe_id: string;
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

export class PostgresAcademySubscriptionRepository implements AcademySubscriptionRepository {
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly gateway: AcademySubscriptionGateway,
    private readonly writePaidGrant: AcademyPaidGrantWriter,
    private readonly recordAuditEvent: AcademySubscriptionAuditWriter
  ) {}

  async getOwnRenewalStatus({
    tribeSlug,
  }: {
    tribeSlug: string;
  }): Promise<AcademySubscriptionRenewalStatus> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select tribe_member_subscriptions.status, tribe_member_subscriptions.cancel_requested_at
        from public.tribe_member_subscriptions
        inner join public.tribes
          on tribes.id = tribe_member_subscriptions.tribe_id
        where tribes.slug = ${tribeSlug}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
        order by tribe_member_subscriptions.created_at desc
        limit 1
      `);
      const row = (result.rows?.[0] ?? null) as {
        cancel_requested_at: string | Date | null;
        status: string;
      } | null;

      if (!row) {
        return ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.none;
      }

      if (row.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending) {
        return ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.pending;
      }

      if (row.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.active) {
        return row.cancel_requested_at
          ? ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.canceling
          : ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.active;
      }

      return ACADEMY_SUBSCRIPTION_RENEWAL_STATUS.canceled;
    });
  }

  async startCheckout(command: StartAcademyCheckoutCommand): Promise<StartAcademyCheckoutResult> {
    const reservation = await this.reserveCheckout(command);

    if (reservation.status !== "reserved") {
      return reservation;
    }

    const row = reservation.row;

    if (row.mercado_pago_preapproval_id && row.checkout_url) {
      return { checkoutUrl: row.checkout_url, status: "redirect" };
    }

    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.gateway.refreshAccessToken,
      storedToken: {
        accessToken: row.access_token,
        paymentIntegrationId: row.payment_integration_id,
        refreshToken: row.refresh_token,
        tokenExpiresAt: row.token_expires_at,
        tribeId: row.tribe_id,
      },
    }).catch(() => null);

    if (!accessToken || !row.payer_email) {
      return { status: "provider_unavailable" };
    }

    let providerCheckout: { checkoutUrl: string; providerSubscriptionId: string };
    const externalReference = `${ACADEMY_OPERATION.externalReferencePrefix}${row.subscription_id}`;
    const claimed = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        insert into public.subscription_idempotency_operations
          (operation_key, operation_type, tribe_id, user_id, payload_hash, response_body)
        select ${ACADEMY_OPERATION.creationKeyPrefix + row.subscription_id}, ${ACADEMY_OPERATION.creationType},
          tribe_id, user_id, id::text, '{}'::jsonb
        from public.tribe_member_subscriptions
        where id = ${row.subscription_id} and user_id = public.current_app_user_id()
        on conflict (operation_key) do nothing returning id
      `);
      return (result.rows ?? []).length > 0;
    });

    try {
      // The durable local claim protects creation even when the provider ignores its header.
      if (!claimed) {
        const recovered = await this.gateway.findCheckoutByReference({ accessToken, externalReference, traceContext: { operationKey: ACADEMY_OPERATION.checkoutKeyPrefix + row.subscription_id, requestId: command.correlationId, tribeSlug: command.tribeSlug } });
        if (!recovered) return { status: "checkout_unresolved" };
        providerCheckout = recovered;
      } else {
        providerCheckout = await this.gateway.createPreapproval({
        accessToken,
        amountCents: row.amount_cents,
        backUrl: buildAcademyBackUrl(command.tribeSlug),
        currency: row.currency,
        externalReference,
        idempotencyKey: `${ACADEMY_OPERATION.checkoutKeyPrefix}${row.subscription_id}`,
        payerEmail: row.payer_email,
        reason: row.price_name,
        traceContext: {
          operationKey: `${ACADEMY_OPERATION.checkoutKeyPrefix}${row.subscription_id}`,
          providerPlanId: row.provider_plan_id,
          requestId: command.correlationId,
          tribeSlug: command.tribeSlug,
        },
      });
      }
    } catch (error) {
      // Release only a definite input/auth rejection, never a timeout or upstream failure.
      if (claimed && error instanceof MercadoPagoRequestError && DEFINITE_CHECKOUT_REJECTION_STATUSES.has(error.statusCode)) {
        await this.executeWithDatabase((database) => database.execute(sql`
          delete from public.subscription_idempotency_operations
          where operation_key = ${ACADEMY_OPERATION.creationKeyPrefix + row.subscription_id}
            and user_id = public.current_app_user_id()
        `));
        return { status: "provider_unavailable" };
      }
      return { status: "checkout_unresolved" };
    }

    return this.linkCheckout({
      checkoutUrl: providerCheckout.checkoutUrl,
      providerSubscriptionId: providerCheckout.providerSubscriptionId,
      subscriptionId: row.subscription_id,
      tribeId: row.tribe_id,
    });
  }

  async cancelOwnRenewal({
    correlationId,
    tribeSlug,
  }: {
    correlationId: string;
    tribeSlug: string;
  }): Promise<CancelAcademyRenewalResult> {
    // Billing stays reachable for blocked members: only ownership is checked.
    const context = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
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
          tribe_payment_integrations.token_expires_at
      `);
      const row = (result.rows?.[0] ?? null) as (SubscriptionContextRow & {
        user_id: string;
      }) | null;

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

    const accessToken = await this.resolveToken(context).catch(() => null);
    const providerStatus = accessToken
      ? await this.gateway
          .cancelPreapproval({
            accessToken,
            preapprovalId: context.mercado_pago_preapproval_id,
            status: "canceled",
          })
          .then(() =>
            this.gateway.getPreapprovalStatus({
              accessToken,
              preapprovalId: context.mercado_pago_preapproval_id,
            })
          )
          .catch(() => undefined)
      : undefined;

    if (providerStatus === undefined) {
      // The cancellation is not confirmed: undo the local request so the UI
      // never claims "cancelada" and the member can retry.
      await this.executeWithDatabase((database) =>
        database.execute(sql`
          update public.tribe_member_subscriptions
          set cancel_requested_at = null
          where id = ${context.subscription_id}
            and status <> ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled}
        `)
      );

      return { status: "provider_unavailable" };
    }

    await this.persistRenewalStatus(context.subscription_id, providerStatus);

    return { status: "canceled" };
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

      return result.rows?.[0] as { found: boolean; preapproval_id: string | null };
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
    });
  }

  async reconcileSubscriptionCoverage({
    correlationId,
    providerSubscriptionId,
  }: {
    correlationId: string;
    providerSubscriptionId: string;
  }): Promise<AcademyCoverageReconciliationResult> {
    const context = await this.readSubscriptionContext(providerSubscriptionId);

    if (!context) {
      return { appliedInvoices: 0, status: "not_found" };
    }

    const accessToken = await this.resolveToken(context).catch(() => null);

    if (!accessToken) {
      return { appliedInvoices: 0, status: "provider_unavailable" };
    }

    let invoices: MercadoPagoAuthorizedPayment[];
    let providerStatus: string | null;

    try {
      [invoices, providerStatus] = await Promise.all([
        this.gateway.searchAuthorizedPayments({ accessToken, preapprovalId: providerSubscriptionId }),
        this.gateway.getPreapprovalStatus({ accessToken, preapprovalId: providerSubscriptionId }),
      ]);
    } catch {
      // Transient provider failure: confirmed grants stay until they end.
      return { appliedInvoices: 0, status: "provider_unavailable" };
    }

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
      return (result.rows ?? []) as Array<SubscriptionContextRow & { provider_account_id: string; provider_invoice_id: string }>;
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
    return { status: hadRetryableFailure ? "retryable" : processedPayment ? "processed" : "ignored" };
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

      return (result.rows ?? []) as Array<{ has_unlinked_checkout: boolean } & Pick<
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

      return {
        status:
          reconciliation.status === "provider_unavailable" ? "retryable" : "processed",
      };
    }

    return { status: hadProviderFailure ? "retryable" : "ignored" };
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
      const tribeId = (tribeResult.rows?.[0] as { id: string } | undefined)?.id;

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
      const member = (memberResult.rows?.[0] ?? null) as { status: string; user_id: string } | null;

      if (!member || (member.status !== "active" && member.status !== "muted")) {
        return { status: "forbidden" as const };
      }

      const contextResult = await database.execute(sql`
        select
          coalesce(tribe_academy_settings.access_model = 'academy', false) as is_academy,
          coalesce(tribe_academy_settings.sales_enabled, false) as sales_enabled,
          tribe_academy_settings.offer_version,
          public.is_member_verified_for_academy(${tribeId}, ${member.user_id}) as is_verified,
          public.has_active_product_grant(${tribeId}, ${member.user_id}, ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}) as is_covered
        from (select 1) as anchor
        left join public.tribe_academy_settings
          on tribe_academy_settings.tribe_id = ${tribeId}
      `);
      const context = contextResult.rows?.[0] as {
        is_academy: boolean;
        is_covered: boolean;
        is_verified: boolean;
        offer_version: number | null;
        sales_enabled: boolean;
      };

      if (!context.is_academy || !context.sales_enabled) {
        return { status: "sales_closed" as const };
      }

      if (Number(context.offer_version) !== command.acceptedOfferVersion) {
        return { status: "offer_changed" as const };
      }

      if (!context.is_verified) {
        return { status: "not_eligible" as const };
      }

      if (context.is_covered) {
        return { status: "covered" as const };
      }

      const liveResult = await database.execute(sql`
        select
          tribe_member_subscriptions.id,
          tribe_member_subscriptions.status,
          tribe_member_subscriptions.mercado_pago_preapproval_id,
          subscription_idempotency_operations.response_body->>'checkoutUrl' as checkout_url
        from public.tribe_member_subscriptions
        left join public.subscription_idempotency_operations
          on subscription_idempotency_operations.operation_key =
            ${ACADEMY_OPERATION.checkoutKeyPrefix} || tribe_member_subscriptions.id::text
        where tribe_member_subscriptions.tribe_id = ${tribeId}
          and tribe_member_subscriptions.user_id = ${member.user_id}
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
      `);
      const live = (liveResult.rows?.[0] ?? null) as {
        checkout_url: string | null;
        id: string;
        mercado_pago_preapproval_id: string | null;
        status: string;
      } | null;

      if (live && live.status !== TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending) {
        return { status: "already_subscribed" as const };
      }

      if (live?.mercado_pago_preapproval_id && live.checkout_url) {
        return { checkoutUrl: live.checkout_url, status: "redirect" as const };
      }

      const subscriptionId =
        live?.id ?? (await this.insertReservation(database, tribeId, member.user_id, command));

      if (!subscriptionId) {
        return { status: "sales_closed" as const };
      }

      const rowResult = await database.execute(sql`
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
      `);

      return { row: rowResult.rows?.[0] as ReservationRow, status: "reserved" as const };
    });
  }

  private async insertReservation(
    database: RequestDatabase,
    tribeId: string,
    userId: string,
    command: StartAcademyCheckoutCommand
  ): Promise<string | null> {
    // Freeze the accepted conditions: later catalog edits never change them.
    const result = await database.execute(sql`
      with current_academy_price as (
        select tribe_subscription_prices.*
        from public.tribe_subscription_prices
        where tribe_subscription_prices.tribe_id = ${tribeId}
          and tribe_subscription_prices.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy}
          and tribe_subscription_prices.status = 'active'
          and tribe_subscription_prices.is_current = true
          and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          and tribe_subscription_prices.payment_integration_id is not null
        limit 1
      )
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
        current_academy_price.id,
        current_academy_price.payment_integration_id,
        ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.academy},
        ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
        ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none},
        current_academy_price.name,
        current_academy_price.amount_cents,
        current_academy_price.currency,
        current_academy_price.frequency,
        current_academy_price.mercado_pago_preapproval_plan_id,
        ${command.acceptedOfferVersion},
        now()
      from current_academy_price
      on conflict do nothing
      returning id
    `);
    const subscriptionId = (result.rows?.[0] as { id: string } | undefined)?.id ?? null;

    if (subscriptionId) {
      await this.recordAuditEvent(database, {
        action: ACADEMY_SUBSCRIPTION_AUDIT_ACTION.checkoutReserved,
        actorUserId: userId,
        correlationId: command.correlationId,
        entityId: subscriptionId,
        entityType: ACADEMY_SUBSCRIPTION_AUDIT_ENTITY.subscription,
        fromState: null,
        reason: null,
        subjectUserId: userId,
        toState: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
        tribeId,
      });
    }

    return subscriptionId;
  }

  private async linkCheckout(input: {
    checkoutUrl: string;
    providerSubscriptionId: string;
    subscriptionId: string;
    tribeId: string;
  }): Promise<StartAcademyCheckoutResult> {
    return this.executeWithDatabase(async (database) => {
      // The unique index on mercado_pago_preapproval_id keeps a provider id
      // bound to exactly one reservation (no attaching someone else's id).
      const linked = await database.execute(sql`
        update public.tribe_member_subscriptions
        set mercado_pago_preapproval_id = ${input.providerSubscriptionId},
            updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${input.subscriptionId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and (
            tribe_member_subscriptions.mercado_pago_preapproval_id is null
            or tribe_member_subscriptions.mercado_pago_preapproval_id = ${input.providerSubscriptionId}
          )
        returning tribe_member_subscriptions.id
      `);

      if ((linked.rows ?? []).length === 0) {
        return { status: "provider_unavailable" as const };
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

      return (result.rows?.[0] ?? null) as SubscriptionContextRow | null;
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
   * Applies one invoice atomically. Returns whether the ledger changed.
   */
  private async applyInvoice(
    subscriptionId: string,
    providerInvoice: MercadoPagoAuthorizedPayment,
    correlationId: string
  ): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const contractResult = await database.execute(sql`
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
      `);
      const contract = contractResult.rows?.[0] as SubscriptionContextRow;
      const existingResult = await database.execute(sql`
        select id, payment_status, provider_last_modified_at, grant_id
        from public.subscription_payment_periods
        where payment_integration_id = ${contract.payment_integration_id}
          and provider_invoice_id = ${providerInvoice.id}
        for update
      `);
      const existing = (existingResult.rows?.[0] ?? null) as {
        grant_id: string | null;
        id: string;
        payment_status: AcademyLedgerPaymentStatus;
        provider_last_modified_at: string | Date | null;
      } | null;
      const decision = decideAcademyInvoiceEffect({
        contract: {
          amountCents: Number(contract.amount_cents),
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
        existing &&
        existing.payment_status === decision.ledgerStatus &&
        (decision.grantAction !== "create" || existing.grant_id !== null)
      ) {
        return false;
      }

      let grantId = existing?.grant_id ?? null;

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

      const ledgerResult = await database.execute(sql`
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
      `);
      const periodId = (ledgerResult.rows?.[0] as { id: string }).id;

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
