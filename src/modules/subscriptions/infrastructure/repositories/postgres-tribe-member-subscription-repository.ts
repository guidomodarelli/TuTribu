/**
 * Persists member subscriptions and webhook idempotency in Postgres.
 *
 * @module postgres-tribe-member-subscription-repository
 */

import { createHash } from "crypto";

import { sql } from "drizzle-orm";
import {buildSubscriptionMembershipUpdateSql,lockSubscriptionMembershipTribes} from "@/src/modules/subscriptions/infrastructure/repositories/subscription-membership-reconciliation-sql";

import type {
  TribeMemberSubscriptionStartResult,
  TribeMemberSubscriptionStatusResult,
  TribeMemberSubscriptionWebhookResult,
} from "@/src/modules/subscriptions/application/results/tribe-member-subscription-result";
import {
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
  TRIBE_SUBSCRIPTION_PRODUCT_KEY,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  MercadoPagoSubscriptionWebhookCommand,
  PendingSubscriptionReturnQuery,
  ProviderSubscriptionReturnPathQuery,
  RetryCurrentPriceSubscriptionPaymentCommand,
  StartCurrentPriceSubscriptionCommand,
  StartOpenJoinSubscriptionCommand,
  TribeMemberSubscriptionStatusQuery,
  TribeMemberSubscriptionRepository,
} from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {
  MercadoPagoPreapprovalDetailsInput,
  MercadoPagoPreapprovalDetailsResult,
  MercadoPagoPreapprovalStatusInput,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import {
  logPaymentOperation,
  type PaymentOperationTraceContext,
} from "@/src/modules/subscriptions/infrastructure/observability/payment-operation-logger";
import { SERVER_LOG_LEVEL } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  resolveMercadoPagoAccessToken,
  type MercadoPagoAccessTokenRefresher,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";
import {
  MERCADO_PAGO_SUBSCRIPTION_STATUS,
  mapMercadoPagoSubscriptionStatus,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-status-mapper";
import { ROUTES } from "@/src/constants/routes";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MercadoPagoPreapprovalStatusGetter = (
  input: MercadoPagoPreapprovalStatusInput
) => Promise<string | null>;

/**
 * Creates a Mercado Pago preapproval subscription through the provider API and
 * returns the authoritative provider subscription id together with the hosted
 * checkout URL (`init_point`). Unlike the hosted preapproval-plan checkout, this
 * yields the `preapproval_id` before the redirect, so it can be persisted on the
 * local pending row and matched by webhooks even if the member never returns to
 * the app from the provider checkout.
 */
type MercadoPagoPreapprovalSubscriptionCreator = (input: {
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
}) => Promise<{ checkoutUrl: string; providerSubscriptionId: string }>;

type MercadoPagoPreapprovalDetailsGetter = (
  input: MercadoPagoPreapprovalDetailsInput
) => Promise<MercadoPagoPreapprovalDetailsResult | null>;

type MercadoPagoPreapprovalStatusUpdater = (input: {
  accessToken: string;
  preapprovalId: string;
  status: "canceled";
  traceContext?: PaymentOperationTraceContext;
}) => Promise<string>;

type MercadoPagoPreapprovalBackUrlUpdater = (input: {
  accessToken: string;
  backUrl: string;
  preapprovalId: string;
  traceContext?: PaymentOperationTraceContext;
}) => Promise<void>;

type SubscriptionStartContextRow = {
  access_token: string | null;
  current_price_amount_cents: number | null;
  current_price_currency: string | null;
  current_price_id: string | null;
  current_price_payment_integration_id: string | null;
  current_price_name: string | null;
  current_price_provider_plan_id: string | null;
  current_user_email: string | null;
  existing_checkout_subscription_id: string | null;
  existing_checkout_url: string | null;
  existing_live_provider_subscription_id: string | null;
  existing_provider_subscription_id: string | null;
  existing_membership_status: string | null;
  existing_membership_status_reason: string | null;
  has_active_invitation: boolean | null;
  has_retry_blocking_member_subscription: boolean | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type SubscriptionReservationRow = {
  checkout_url: string | null;
  reserved_subscription_id: string | null;
};

type WebhookSubscriptionContextRow = {
  access_token: string | null;
  local_status: string | null;
  local_status_reason: string | null;
  payment_integration_id: string | null;
  price_id: string | null;
  refresh_token: string | null;
  subscription_found: boolean | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type StartSubscriptionCheckoutInput = {
  allowOpenJoin?: boolean;
  idempotencyKey: string;
  invitationTokenHash: string;
  requiresActiveInvitation: boolean;
  tribeSlug: string;
};

type WebhookOperationInsertRow = {
  operation_inserted: string | null;
};

type PendingSubscriptionReturnRow = {
  has_pending_subscription_return: boolean | null;
};

type ProviderSubscriptionReturnPathRow = {
  tribe_slug: string | null;
};

type SubscriptionReconciliationContextRow = {
  access_token: string | null;
  is_reconciliation_fresh: boolean | null;
  mercado_pago_preapproval_id: string | null;
  payment_integration_id: string | null;
  price_id: string | null;
  refresh_token: string | null;
  subscription_found: boolean | null;
  subscription_status: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PendingSubscriptionReturnAttachmentContextRow = {
  access_token: string | null;
  payment_integration_id: string | null;
  price_id: string | null;
  provider_plan_id: string | null;
  refresh_token: string | null;
  reserved_subscription_id: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type MissingSubscriptionReturnRecoveryContextRow = {
  access_token: string | null;
  current_price_id: string | null;
  current_price_payment_integration_id: string | null;
  current_price_provider_plan_id: string | null;
  has_recent_plan_checkout: boolean | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type SubscriptionReturnStatusRow = {
  status: string | null;
};

const SUBSCRIPTION_CHECKOUT_CONTEXT = {
  invitationSettingName: "app.current_invitation_hash",
  settingName: "app.subscription_checkout_tribe_id",
} as const;

const SUBSCRIPTION_INVITATION_ASSOCIATION_TYPE = {
  current: "current",
  specific: "specific",
} as const;

/**
 * Defines when an unfinished local checkout reservation can be retried.
 */
const SUBSCRIPTION_RESERVATION = {
  returnRecoveryInterval: "24 hours",
  staleReservationInterval: "5 minutes",
} as const;

/**
 * Prefixes the Mercado Pago `X-Idempotency-Key` for a checkout, joined with the
 * reserved local subscription id so retries of the same reservation return the
 * same provider preapproval instead of creating a duplicate one.
 */
const MEMBER_SUBSCRIPTION_PREAPPROVAL_IDEMPOTENCY_PREFIX =
  "mercado-pago-preapproval:";

/**
 * Bounds how stale the locally stored subscription status may be before access
 * resolution reconciles it against Mercado Pago again. Within this window the
 * reconcile reuses the stored status instead of issuing a provider HTTP call and
 * a write, which collapses the repeated reconciliations triggered by concurrent
 * renders of the same page. Real-time provider webhooks keep the stored status
 * fresh between windows, so authorization staleness stays bounded by this value.
 */
const RECONCILIATION_FRESHNESS_SECONDS = 60;

type CacheableReconciliationStatus =
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.active
  | typeof TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused;

const RECONCILIATION_CACHEABLE_SUBSCRIPTION_STATUSES: ReadonlySet<string> =
  new Set([
    TRIBE_MEMBER_SUBSCRIPTION_STATUS.active,
    TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused,
  ]);

const SUBSCRIPTION_RETURN_QUERY = {
  mercadoPagoPreapprovalId: "preapproval_id",
} as const;

/**
 * Local statuses that represent a live provider preapproval blocking another checkout.
 */
const CURRENT_MEMBER_SUBSCRIPTION_STATUSES = sql`(
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.gracePeriod},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pastDue},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused}
)`;

/**
 * Statuses that mean the member already has current tribe access through a
 * confirmed provider subscription and should not start a new checkout.
 */
const LIVE_PROVIDER_SUBSCRIPTION_STATUSES = sql`(
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
)`;

/**
 * Human-readable operation names recorded in payment lifecycle logs (the
 * `operation` field). Companion to MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY,
 * which builds the trace `operation_key` prefix used to correlate retries.
 */
const MEMBER_SUBSCRIPTION_PAYMENT_OPERATION = {
  cancelSubscription: "cancel-member-subscription",
  confirmReturn: "confirm-member-subscription-return",
  linkReturnBackUrl: "link-member-subscription-return-back-url",
  reconcileSubscription: "reconcile-member-subscription",
  startCheckout: "start-member-subscription-checkout",
  startCheckoutAlreadyActive: "start-member-subscription-already-active",
  webhook: "mercado-pago-webhook",
} as const;

/**
 * Trace `operation_key` prefixes joined with `separator` + identifiers to
 * correlate retries and outcomes. Values intentionally differ from
 * MEMBER_SUBSCRIPTION_PAYMENT_OPERATION (notably `startSubscription` uses the
 * `member-plan-subscription` prefix) to keep the trace key stable across
 * checkout retries while the human-readable operation name evolves.
 */
const MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY = {
  cancelSubscription: "cancel-member-subscription",
  confirmReturn: "confirm-member-subscription-return",
  reconcileSubscription: "reconcile-member-subscription",
  startSubscription: "member-plan-subscription",
  startSubscriptionAlreadyActive: "member-plan-subscription-already-active",
  webhook: "mercado-pago-webhook",
} as const;

/**
 * Defines persisted tribe membership statuses that subscriptions may recover
 * while starting or retrying paid checkout flows.
 */
const MEMBER_SUBSCRIPTION_RECOVERY_MEMBERSHIP_STATUS = {
  blocked: "blocked",
  removed: "removed",
} as const;

const MEMBER_SUBSCRIPTION_PAYMENT_LOG = {
  completedMessage: "Member subscription payment operation completed",
  returnBackUrlLinkFailedMessage:
    "Failed to link preapproval id into the subscription return back URL",
} as const;

const MEMBER_SUBSCRIPTION_BACK_URL_LINK_RESULT = {
  failed: "back_url_link_failed",
} as const;

/**
 * Builds a trace context for Mercado Pago operations scoped to member subscriptions.
 *
 * @param input - Payment operation identifiers available at the repository boundary.
 * @returns Trace context for provider logging, or undefined when request tracing is unavailable.
 */
function buildMemberSubscriptionPaymentTraceContext(input: {
  operationKey: string;
  preapprovalId?: string | null;
  priceId?: string | null;
  providerPlanId?: string | null;
  requestId?: string;
  tribeSlug?: string | null;
}): PaymentOperationTraceContext | undefined {
  if (!input.requestId) {
    return undefined;
  }

  return {
    operationKey: input.operationKey,
    preapprovalId: input.preapprovalId,
    priceId: input.priceId,
    providerPlanId: input.providerPlanId,
    requestId: input.requestId,
    tribeSlug: input.tribeSlug,
  };
}

/**
 * Builds a stable operation key for member subscription payment workflows.
 *
 * @param parts - Operation family and identifiers.
 * @returns Stable operation key for tracing retries and outcomes.
 */
function buildMemberSubscriptionOperationKey(parts: {
  operation: string;
  providerSubscriptionId?: string | null;
  tribeSlug: string;
}): string {
  return [
    parts.operation,
    parts.tribeSlug,
    parts.providerSubscriptionId ?? "",
  ].join(":");
}

/**
 * Logs a member subscription payment result when request tracing is available.
 *
 * @param input - Operation trace context and result status.
 * @returns Nothing.
 */
function logMemberSubscriptionPaymentResult(input: {
  operation: string;
  traceContext?: PaymentOperationTraceContext;
  result: string;
}): void {
  logPaymentOperation({
    context: input.traceContext,
    message: MEMBER_SUBSCRIPTION_PAYMENT_LOG.completedMessage,
    operation: input.operation,
    result: input.result,
  });
}

/**
 * Hashes an idempotent operation payload for safe persistence.
 *
 * @param payload - Payload to hash.
 * @returns SHA-256 hash for the payload.
 */
function hashPayload(payload: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Hashes an invitation token using the same digest stored by tribe invitations.
 *
 * @param token - Raw invitation token from the invite URL.
 * @returns SHA-256 hash for lookup.
 */
function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Builds the internal tribe return path for a Mercado Pago subscription result.
 *
 * @param input - Tribe slug and provider subscription identifier.
 * @returns Relative tribe path with the provider return query.
 */
function buildProviderSubscriptionReturnPath(input: {
  providerSubscriptionId: string;
  tribeSlug: string;
}): string {
  const query = new URLSearchParams({
    [SUBSCRIPTION_RETURN_QUERY.mercadoPagoPreapprovalId]:
      input.providerSubscriptionId,
  });

  return ROUTES.tribes.bySlug(input.tribeSlug) + "?" + query.toString();
}

/**
 * Builds the local external reference stored in Mercado Pago plans.
 *
 * @param priceId - Local subscription price identifier.
 * @returns Provider external reference for a TuTribu price.
 */
function buildPriceExternalReference(priceId: string): string {
  return `tutribu:price:${priceId}`;
}

/**
 * Checks whether a fresh local subscription status can be returned directly by
 * the public reconciliation contract without consulting the provider again.
 *
 * @param status - Local subscription status stored in Postgres.
 * @returns Whether the status is safe to expose from reconciliation.
 */
function isCacheableReconciliationStatus(
  status: string | null
): status is CacheableReconciliationStatus {
  return (
    status !== null &&
    RECONCILIATION_CACHEABLE_SUBSCRIPTION_STATUSES.has(status)
  );
}

export class PostgresTribeMemberSubscriptionRepository
  implements TribeMemberSubscriptionRepository
{
  /**
   * Creates a member subscription repository with provider adapters and trace context.
   *
   * @param executeWithDatabase - Request-scoped database executor.
   * @param createMercadoPagoPreapprovalSubscription - Adapter that creates a provider preapproval and returns its id plus checkout URL.
   * @param getMercadoPagoPreapprovalDetails - Adapter that reads provider preapproval details.
   * @param getMercadoPagoPreapprovalStatus - Adapter that reads provider preapproval status.
   * @param updateMercadoPagoPreapprovalStatus - Adapter that updates provider preapproval status.
   * @param updateMercadoPagoPreapprovalBackUrl - Adapter that links the authoritative preapproval id into the provider back URL.
   * @param refreshMercadoPagoAccessToken - Adapter that refreshes provider tokens.
   * @param requestId - Optional request correlation identifier for payment traces.
   */
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly createMercadoPagoPreapprovalSubscription: MercadoPagoPreapprovalSubscriptionCreator,
    private readonly getMercadoPagoPreapprovalDetails: MercadoPagoPreapprovalDetailsGetter,
    private readonly getMercadoPagoPreapprovalStatus: MercadoPagoPreapprovalStatusGetter,
    private readonly updateMercadoPagoPreapprovalStatus: MercadoPagoPreapprovalStatusUpdater,
    private readonly updateMercadoPagoPreapprovalBackUrl: MercadoPagoPreapprovalBackUrlUpdater,
    private readonly refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher,
    private readonly requestId?: string
  ) {}

  /**
   * Verifies that a provider return belongs to the current user's pending subscription.
   *
   * @param query - Tribe slug and Mercado Pago preapproval id from the return URL.
   * @returns Whether the return can show the pending confirmation state.
   */
  async hasPendingSubscriptionReturn(query: {
    providerSubscriptionId: string;
    tribeSlug: string;
  }): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${query.tribeSlug}
          limit 1
        )
        select exists (
          select 1
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
            and tribe_member_subscriptions.mercado_pago_preapproval_id = ${query.providerSubscriptionId}
        ) as has_pending_subscription_return
      `);
      const row = (result.rows?.[0] ?? null) as PendingSubscriptionReturnRow | null;

      return row?.has_pending_subscription_return === true;
    });
  }

  /**
   * Resolves where a Mercado Pago return should land when the provider used the root back URL.
   *
   * @param query - Mercado Pago preapproval id from the return URL.
   * @returns Relative tribe return path, or null when the subscription cannot be resolved safely.
   */
  async resolveReturnPathByProviderSubscription(
    query: ProviderSubscriptionReturnPathQuery
  ): Promise<string | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with matching_subscription as (
          select tribes.slug
          from public.tribe_member_subscriptions
          inner join public.tribes
            on tribes.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.mercado_pago_preapproval_id = ${query.providerSubscriptionId}
            and tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          order by tribe_member_subscriptions.updated_at desc
          limit 1
        ),
        pending_plan_checkouts as (
          select
            tribes.slug,
            count(*) over () as pending_count
          from public.tribe_member_subscriptions
          inner join public.tribes
            on tribes.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
            and tribe_member_subscriptions.mercado_pago_preapproval_id is null
          order by tribe_member_subscriptions.updated_at desc
        )
        select coalesce(
          (select slug from matching_subscription),
          (
            select slug
            from pending_plan_checkouts
            where pending_count = 1
            limit 1
          )
        ) as tribe_slug
      `);
      const row = (result.rows?.[0] ?? null) as
        | ProviderSubscriptionReturnPathRow
        | null;

      return row?.tribe_slug
        ? buildProviderSubscriptionReturnPath({
            providerSubscriptionId: query.providerSubscriptionId,
            tribeSlug: row.tribe_slug,
          })
        : null;
    });
  }

  /**
   * Resolves a provider return and repairs local linkage while the webhook is pending.
   *
   * @param query - Tribe slug and Mercado Pago preapproval id from the return URL.
   * @returns Local status that the return page can show without granting access itself.
   */
  async resolveSubscriptionReturn(
    query: PendingSubscriptionReturnQuery
  ): Promise<TribeMemberSubscriptionStatusResult> {
    const existingSubscription = await this.resolveLocalSubscriptionReturnStatus({
      providerSubscriptionId: query.providerSubscriptionId,
      tribeSlug: query.tribeSlug,
    });

    if (existingSubscription.status !== TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound) {
      return existingSubscription;
    }

    const pendingSubscription = await this.attachPendingPlanCheckoutReturn(query);

    if (pendingSubscription.status !== TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound) {
      return pendingSubscription;
    }

    return this.recoverMissingPlanCheckoutReturn(query);
  }

  private async resolveLocalSubscriptionReturnStatus(input: {
    providerSubscriptionId: string;
    tribeSlug: string;
  }): Promise<TribeMemberSubscriptionStatusResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select tribe_member_subscriptions.status
        from public.tribe_member_subscriptions
        inner join target_tribe
          on target_tribe.id = tribe_member_subscriptions.tribe_id
        where tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
          and tribe_member_subscriptions.mercado_pago_preapproval_id = ${input.providerSubscriptionId}
        order by tribe_member_subscriptions.updated_at desc
        limit 1
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionReturnStatusRow | null;

      return {
        status: row?.status ?? TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound,
      } as TribeMemberSubscriptionStatusResult;
    });
  }

  /**
   * Reconciles the current member subscription before granting tribe access.
   *
   * @param query - Tribe slug used to find the current member subscription.
   * @returns Local status after provider reconciliation.
   */
  async reconcileCurrentMemberSubscription(
    query: TribeMemberSubscriptionStatusQuery
  ): Promise<TribeMemberSubscriptionStatusResult> {
    return this.reconcileSubscriptionByProviderId({
      providerSubscriptionId: null,
      tribeSlug: query.tribeSlug,
    });
  }

  /**
   * Cancels the current member subscription in Mercado Pago and removes access.
   *
   * @param query - Tribe slug used to find the current member subscription.
   * @returns Local status after provider cancellation.
   */
  async cancelOwnSubscription(
    query: TribeMemberSubscriptionStatusQuery
  ): Promise<TribeMemberSubscriptionStatusResult> {
    const context = await this.resolveSubscriptionReconciliationContext({
      providerSubscriptionId: null,
      tribeSlug: query.tribeSlug,
    });

    if (!context?.subscription_found || !context.mercado_pago_preapproval_id) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    const accessToken = await this.resolveAccessTokenForSubscriptionContext(
      context
    );

    if (!accessToken) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    let confirmedProviderStatus: string;
    const operationKey = buildMemberSubscriptionOperationKey({
      operation:
        MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.cancelSubscription,
      tribeSlug: query.tribeSlug,
    });
    const traceContext = buildMemberSubscriptionPaymentTraceContext({
      operationKey,
      preapprovalId: context.mercado_pago_preapproval_id,
      priceId: context.price_id,
      requestId: this.requestId,
      tribeSlug: query.tribeSlug,
    });

    try {
      confirmedProviderStatus = await this.updateMercadoPagoPreapprovalStatus({
        accessToken,
        preapprovalId: context.mercado_pago_preapproval_id,
        status: MERCADO_PAGO_SUBSCRIPTION_STATUS.canceled,
        ...(traceContext ? { traceContext } : {}),
      });
    } catch {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    if (
      confirmedProviderStatus !== MERCADO_PAGO_SUBSCRIPTION_STATUS.canceled &&
      confirmedProviderStatus !== MERCADO_PAGO_SUBSCRIPTION_STATUS.cancelled
    ) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    await this.persistProviderSubscriptionStatus({
      providerSubscriptionId: context.mercado_pago_preapproval_id,
      providerStatus: confirmedProviderStatus,
    });

    return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled };
  }

  private async reconcileSubscriptionByProviderId(input: {
    providerSubscriptionId: string | null;
    tribeSlug: string;
  }): Promise<TribeMemberSubscriptionStatusResult> {
    const context = await this.resolveSubscriptionReconciliationContext(input);

    if (!context?.subscription_found || !context.mercado_pago_preapproval_id) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    // Reuse the recently reconciled status instead of issuing another provider
    // call and write. Webhooks keep the stored status current between windows.
    if (
      context.is_reconciliation_fresh &&
      isCacheableReconciliationStatus(context.subscription_status)
    ) {
      return {
        status: context.subscription_status,
      };
    }

    const accessToken = await this.resolveAccessTokenForSubscriptionContext(
      context
    );

    if (!accessToken) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    let providerStatus: string | null;
    const operationKey = buildMemberSubscriptionOperationKey({
      operation:
        MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.reconcileSubscription,
      tribeSlug: input.tribeSlug,
    });
    const traceContext = buildMemberSubscriptionPaymentTraceContext({
      operationKey,
      preapprovalId: context.mercado_pago_preapproval_id,
      priceId: context.price_id,
      requestId: this.requestId,
      tribeSlug: input.tribeSlug,
    });

    try {
      providerStatus = await this.getMercadoPagoPreapprovalStatus({
        accessToken,
        preapprovalId: context.mercado_pago_preapproval_id,
        ...(traceContext ? { traceContext } : {}),
      });
    } catch {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    const subscriptionStatus = mapMercadoPagoSubscriptionStatus(providerStatus);

    await this.persistProviderSubscriptionStatus({
      providerSubscriptionId: context.mercado_pago_preapproval_id,
      providerStatus,
    });

    return {
      status: subscriptionStatus.status,
    };
  }

  private async attachPendingPlanCheckoutReturn(
    query: PendingSubscriptionReturnQuery
  ): Promise<TribeMemberSubscriptionStatusResult> {
    const context = await this.resolvePendingSubscriptionReturnAttachmentContext({
      tribeSlug: query.tribeSlug,
    });

    if (!context?.reserved_subscription_id) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: context.access_token,
        paymentIntegrationId: context.payment_integration_id,
        refreshToken: context.refresh_token,
        tokenExpiresAt: context.token_expires_at,
        tribeId: context.tribe_id,
      },
    }).catch(() => null);

    if (!accessToken) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    let providerSubscription: MercadoPagoPreapprovalDetailsResult | null;
    const operationKey = buildMemberSubscriptionOperationKey({
      operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.confirmReturn,
      tribeSlug: query.tribeSlug,
    });
    const traceContext = buildMemberSubscriptionPaymentTraceContext({
      operationKey,
      preapprovalId: query.providerSubscriptionId,
      priceId: context.price_id,
      providerPlanId: context.provider_plan_id,
      requestId: this.requestId,
      tribeSlug: query.tribeSlug,
    });

    try {
      providerSubscription = await this.getMercadoPagoPreapprovalDetails({
        accessToken,
        preapprovalId: query.providerSubscriptionId,
        ...(traceContext ? { traceContext } : {}),
      });
    } catch {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    // Parity with recoverMissingPlanCheckoutReturn: only attach a provider
    // preapproval that actually belongs to this pending checkout's price, so a
    // client-supplied preapproval_id from a return URL cannot be bound to an
    // unrelated reservation. The unique index on mercado_pago_preapproval_id is
    // the database backstop; this is the application-layer guard.
    if (
      !providerSubscription ||
      !context.price_id ||
      !context.provider_plan_id ||
      providerSubscription.preapprovalPlanId !== context.provider_plan_id ||
      (providerSubscription.externalReference !== null &&
        providerSubscription.externalReference !==
          buildPriceExternalReference(context.price_id))
    ) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    const wasProviderSubscriptionAttached =
      await this.attachProviderSubscriptionToPendingPlanCheckout({
        providerSubscriptionId: query.providerSubscriptionId,
        subscriptionId: context.reserved_subscription_id,
      });

    if (!wasProviderSubscriptionAttached) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    return {
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    };
  }

  private async recoverMissingPlanCheckoutReturn(
    query: PendingSubscriptionReturnQuery
  ): Promise<TribeMemberSubscriptionStatusResult> {
    const context = await this.resolveMissingSubscriptionReturnRecoveryContext({
      tribeSlug: query.tribeSlug,
    });

    if (
      !context?.tribe_id ||
      !context.current_price_id ||
      !context.current_price_provider_plan_id ||
      !context.has_recent_plan_checkout
    ) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: context.access_token,
        paymentIntegrationId: context.current_price_payment_integration_id,
        refreshToken: context.refresh_token,
        tokenExpiresAt: context.token_expires_at,
        tribeId: context.tribe_id,
      },
    }).catch(() => null);

    if (!accessToken) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    let providerSubscription: MercadoPagoPreapprovalDetailsResult | null;
    const operationKey = buildMemberSubscriptionOperationKey({
      operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.confirmReturn,
      tribeSlug: query.tribeSlug,
    });
    const traceContext = buildMemberSubscriptionPaymentTraceContext({
      operationKey,
      preapprovalId: query.providerSubscriptionId,
      priceId: context.current_price_id,
      providerPlanId: context.current_price_provider_plan_id,
      requestId: this.requestId,
      tribeSlug: query.tribeSlug,
    });

    try {
      providerSubscription = await this.getMercadoPagoPreapprovalDetails({
        accessToken,
        preapprovalId: query.providerSubscriptionId,
        ...(traceContext ? { traceContext } : {}),
      });
    } catch {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    if (
      !providerSubscription ||
      providerSubscription.preapprovalPlanId !==
        context.current_price_provider_plan_id ||
      (providerSubscription.externalReference !== null &&
        providerSubscription.externalReference !==
          buildPriceExternalReference(context.current_price_id))
    ) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    const wasSubscriptionRecovered =
      await this.persistRecoveredPlanCheckoutReturn({
        priceId: context.current_price_id,
        providerSubscriptionId: query.providerSubscriptionId,
        tribeId: context.tribe_id,
      });

    if (!wasSubscriptionRecovered) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    return {
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    };
  }

  private async resolveAccessTokenForSubscriptionContext(
    context: SubscriptionReconciliationContextRow
  ): Promise<string | null> {
    return resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: context.access_token,
        paymentIntegrationId: context.payment_integration_id,
        refreshToken: context.refresh_token,
        tokenExpiresAt: context.token_expires_at,
        tribeId: context.tribe_id,
      },
    }).catch(() => null);
  }

  private async resolveSubscriptionReconciliationContext(input: {
    providerSubscriptionId: string | null;
    tribeSlug: string;
  }): Promise<SubscriptionReconciliationContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        target_subscription as (
          select
            tribe_member_subscriptions.payment_integration_id,
            tribe_member_subscriptions.price_id,
            tribe_member_subscriptions.tribe_id,
            tribe_member_subscriptions.mercado_pago_preapproval_id,
            tribe_member_subscriptions.status,
            tribe_member_subscriptions.updated_at
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
            and (
              ${input.providerSubscriptionId ?? ""} = ''
              or tribe_member_subscriptions.mercado_pago_preapproval_id = ${input.providerSubscriptionId ?? ""}
            )
            and tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          order by tribe_member_subscriptions.updated_at desc
          limit 1
        )
        select
          tribe_payment_integrations.id as payment_integration_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          coalesce((select mercado_pago_preapproval_id from target_subscription), null) as mercado_pago_preapproval_id,
          coalesce((select price_id from target_subscription), null) as price_id,
          coalesce((select tribe_id from target_subscription), (select id from target_tribe)) as tribe_id,
          coalesce((select true from target_subscription), false) as subscription_found,
          (select status from target_subscription) as subscription_status,
          coalesce(
            (
              select timezone('utc', now()) - target_subscription.updated_at
                < make_interval(secs => ${RECONCILIATION_FRESHNESS_SECONDS})
              from target_subscription
            ),
            false
          ) as is_reconciliation_fresh,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join public.tribe_subscription_prices
          on tribe_subscription_prices.id = (select price_id from target_subscription)
          and tribe_subscription_prices.tribe_id = (select id from target_tribe)
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.id = coalesce(
            (select payment_integration_id from target_subscription),
            tribe_subscription_prices.payment_integration_id
          )
          and tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as
        | SubscriptionReconciliationContextRow
        | null;
    });
  }

  private async resolvePendingSubscriptionReturnAttachmentContext(input: {
    tribeSlug: string;
  }): Promise<PendingSubscriptionReturnAttachmentContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        pending_subscription as (
          select
            tribe_member_subscriptions.id,
            tribe_member_subscriptions.payment_integration_id,
            tribe_member_subscriptions.price_id
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          order by tribe_member_subscriptions.updated_at desc
          limit 1
        )
        select
          tribe_payment_integrations.id as payment_integration_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          (select price_id from pending_subscription) as price_id,
          (
            select tribe_subscription_prices.mercado_pago_preapproval_plan_id
            from public.tribe_subscription_prices
            where tribe_subscription_prices.id = (select price_id from pending_subscription)
          ) as provider_plan_id,
          (select id from pending_subscription) as reserved_subscription_id,
          tribe_payment_integrations.token_expires_at,
          (select id from target_tribe) as tribe_id
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.id = (select payment_integration_id from pending_subscription)
          and tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as
        | PendingSubscriptionReturnAttachmentContextRow
        | null;
    });
  }

  private async resolveMissingSubscriptionReturnRecoveryContext(input: {
    tribeSlug: string;
  }): Promise<MissingSubscriptionReturnRecoveryContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        current_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id,
            tribe_subscription_prices.payment_integration_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.status = 'active'
            and tribe_subscription_prices.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_subscription_prices.is_current = true
          limit 1
        ),
        recent_plan_checkout as (
          select 1
          from public.subscription_idempotency_operations
          where subscription_idempotency_operations.tribe_id = (select id from target_tribe)
            and subscription_idempotency_operations.user_id = public.current_app_user_id()
            and subscription_idempotency_operations.operation_type = 'start_member_subscription'
            and subscription_idempotency_operations.response_body ? 'checkoutUrl'
            and subscription_idempotency_operations.created_at >=
              timezone('utc', now()) - ${SUBSCRIPTION_RESERVATION.returnRecoveryInterval}::interval
            and (
              -- API-created checkouts persist the provider plan id explicitly
              -- because their stored init_point only carries the preapproval_id,
              -- not the preapproval_plan_id.
              subscription_idempotency_operations.response_body->>'preapprovalPlanId'
                = (select mercado_pago_preapproval_plan_id from current_price)
              -- Legacy hosted preapproval-plan checkouts only stored the URL, whose
              -- query string still embeds preapproval_plan_id=<plan>.
              or position(
                'preapproval_plan_id=' || (select mercado_pago_preapproval_plan_id from current_price)
                in coalesce(subscription_idempotency_operations.response_body->>'checkoutUrl', '')
              ) > 0
            )
          limit 1
        )
        select
          tribe_payment_integrations.access_token,
          (select id from current_price) as current_price_id,
          (select payment_integration_id from current_price) as current_price_payment_integration_id,
          (select mercado_pago_preapproval_plan_id from current_price) as current_price_provider_plan_id,
          exists (select 1 from recent_plan_checkout) as has_recent_plan_checkout,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          (select id from target_tribe) as tribe_id
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.id = (select payment_integration_id from current_price)
          and tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as
        | MissingSubscriptionReturnRecoveryContextRow
        | null;
    });
  }

  private async persistProviderSubscriptionStatus(input: {
    providerSubscriptionId: string;
    providerStatus: string | null;
  }): Promise<void> {
    const subscriptionStatus = mapMercadoPagoSubscriptionStatus(
      input.providerStatus
    );

    await this.executeWithDatabase(async (database) => {
      await lockSubscriptionMembershipTribes(database,{providerSubscriptionId:input.providerSubscriptionId});
      await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          status = ${subscriptionStatus.status},
          status_reason = ${subscriptionStatus.statusReason},
          updated_at = timezone('utc', now())
        where mercado_pago_preapproval_id = ${input.providerSubscriptionId}
          and user_id = public.current_app_user_id()
      `);

      await this.updateMembershipAccessForProviderSubscription(
        database,
        input.providerSubscriptionId
      );
    });
  }

  private async attachProviderSubscriptionToPendingPlanCheckout(input: {
    providerSubscriptionId: string;
    subscriptionId: string;
  }): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      await lockSubscriptionMembershipTribes(database,{subscriptionId:input.subscriptionId});
      const updatedSubscriptionResult = await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          mercado_pago_preapproval_id = ${input.providerSubscriptionId},
          status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
          status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
          updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${input.subscriptionId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
        returning id
      `);

      if ((updatedSubscriptionResult.rows ?? []).length === 0) {
        return false;
      }

      await this.updateMembershipAccessForProviderSubscription(
        database,
        input.providerSubscriptionId
      );

      return true;
    });
  }

  private async persistRecoveredPlanCheckoutReturn(input: {
    priceId: string;
    providerSubscriptionId: string;
    tribeId: string;
  }): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      await lockSubscriptionMembershipTribes(database,{tribeId:input.tribeId});
      await database.execute(sql`
        insert into public.tribe_members (
          tribe_id,
          user_id,
          role,
          status,
          status_reason,
          created_at
        )
        values (
          ${input.tribeId},
          public.current_app_user_id(),
          'tribemate',
          'blocked',
          ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
          timezone('utc', now())
        )
        on conflict (tribe_id, user_id) do update
        set
          status = 'blocked',
          status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
        where tribe_members.status = 'removed'
          and tribe_members.status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive}
      `);

      const recoveredSubscriptionResult = await database.execute(sql`
        insert into public.tribe_member_subscriptions (
          tribe_id,
          user_id,
          price_id,
          mercado_pago_preapproval_id,
          status,
          status_reason,
          created_at,
          updated_at
        )
        values (
          ${input.tribeId},
          public.current_app_user_id(),
          ${input.priceId},
          ${input.providerSubscriptionId},
          ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
          ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
          timezone('utc', now()),
          timezone('utc', now())
        )
        on conflict do nothing
        returning id
      `);

      if ((recoveredSubscriptionResult.rows ?? []).length === 0) {
        return false;
      }

      await this.updateMembershipAccessForProviderSubscription(
        database,
        input.providerSubscriptionId
      );

      return true;
    });
  }

  /**
   * Starts or resumes a current-price subscription for the current user.
   *
   * @param command - Tribe slug and idempotency key.
   * @returns Checkout URL or a stable rejection status.
   */
  async startCurrentPriceSubscription(
    command: StartCurrentPriceSubscriptionCommand
  ): Promise<TribeMemberSubscriptionStartResult> {
    return this.startCurrentPriceSubscriptionCheckout({
      idempotencyKey: command.idempotencyKey,
      invitationTokenHash: hashInvitationToken(command.invitationToken),
      requiresActiveInvitation: true,
      tribeSlug: command.tribeSlug,
    });
  }

  /**
   * Retries a current-price subscription for a recoverable paid member.
   *
   * @param command - Tribe slug and idempotency key.
   * @returns Checkout URL or a stable rejection status.
   */
  async retryCurrentPriceSubscriptionPayment(
    command: RetryCurrentPriceSubscriptionPaymentCommand
  ): Promise<TribeMemberSubscriptionStartResult> {
    return this.startCurrentPriceSubscriptionCheckout({
      idempotencyKey: command.idempotencyKey,
      invitationTokenHash: "",
      requiresActiveInvitation: false,
      tribeSlug: command.tribeSlug,
    });
  }

  /**
   * Starts a current-price subscription from a public tribe link without a token.
   *
   * Unlike the retry flow, this path does not require a pre-existing recoverable
   * membership: a brand-new visitor can subscribe to the tribe current paid
   * price. The checkout still requires a paid price flagged as current and a
   * connected provider plan; otherwise it returns a stable rejection status.
   *
   * @param command - Tribe slug and idempotency key.
   * @returns Checkout URL or a stable rejection status.
   */
  async startOpenJoinSubscription(
    command: StartOpenJoinSubscriptionCommand
  ): Promise<TribeMemberSubscriptionStartResult> {
    return this.startCurrentPriceSubscriptionCheckout({
      allowOpenJoin: true,
      idempotencyKey: command.idempotencyKey,
      invitationTokenHash: "",
      requiresActiveInvitation: false,
      tribeSlug: command.tribeSlug,
    });
  }

  private async startCurrentPriceSubscriptionCheckout(
    input: StartSubscriptionCheckoutInput
  ): Promise<TribeMemberSubscriptionStartResult> {
    const operationKey = [
      MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.startSubscription,
      input.tribeSlug,
      input.idempotencyKey,
    ].join(":");

    // An open-join visitor is not a member and has no invitation token, so the
    // tribes SELECT policies hide the tribe row and the direct slug read returns
    // null. Fall back to the SECURITY DEFINER resolver, which exposes only the
    // tribe id for a tribe that offers its current paid plan as the live option,
    // so the checkout can resolve the target tribe without widening tribe row
    // visibility through RLS. Invitation and retry checkouts keep relying on the
    // RLS-scoped read.
    const openJoinTribeIdFallback = input.allowOpenJoin
      ? sql`, public.tribe_open_join_id_by_slug(${input.tribeSlug})`
      : sql``;

    const context = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select coalesce(
            (
              select tribes.id
              from public.tribes
              where tribes.slug = ${input.tribeSlug}
              limit 1
            )${openJoinTribeIdFallback}
          ) as id
        ),
        checkout_context as (
          select
            set_config(
              ${SUBSCRIPTION_CHECKOUT_CONTEXT.settingName},
              coalesce((select id from target_tribe)::text, ''),
              true
            ),
            set_config(
              ${SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName},
              ${input.invitationTokenHash},
              true
            )
        ),
        active_invitation as (
          select
            tribe_invitations.id,
            tribe_invitations.subscription_association_type,
            tribe_invitations.subscription_price_id
          from public.tribe_invitations
          cross join checkout_context
          inner join target_tribe
            on target_tribe.id = tribe_invitations.tribe_id
          where tribe_invitations.token_hash = ${input.invitationTokenHash}
            and tribe_invitations.status = 'active'
          limit 1
        ),
        current_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.name,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id,
            tribe_subscription_prices.payment_integration_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          left join active_invitation
            on true
          where tribe_subscription_prices.status = 'active'
            and tribe_subscription_prices.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and (
              (
                ${input.requiresActiveInvitation} = true
                and active_invitation.subscription_association_type = ${SUBSCRIPTION_INVITATION_ASSOCIATION_TYPE.specific}
                and tribe_subscription_prices.id = active_invitation.subscription_price_id
              )
              or (
                tribe_subscription_prices.is_current = true
                and (
                  ${input.requiresActiveInvitation} = false
                  or active_invitation.subscription_association_type = ${SUBSCRIPTION_INVITATION_ASSOCIATION_TYPE.current}
                )
              )
            )
          limit 1
        ),
        existing_membership as (
          select
            tribe_members.status,
            tribe_members.status_reason
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = public.current_app_user_id()
          limit 1
        ),
        retry_blocking_member_subscription as (
          select 1
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          limit 1
        ),
        existing_pending_checkout as (
          select
            subscription_idempotency_operations.response_body->>'checkoutUrl' as checkout_url,
            tribe_member_subscriptions.id as subscription_id,
            tribe_member_subscriptions.mercado_pago_preapproval_id as provider_subscription_id
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          inner join public.subscription_idempotency_operations
            on subscription_idempotency_operations.tribe_id = target_tribe.id
            and subscription_idempotency_operations.user_id = tribe_member_subscriptions.user_id
            and subscription_idempotency_operations.operation_type = 'start_member_subscription'
            and subscription_idempotency_operations.response_body ? 'checkoutUrl'
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          order by subscription_idempotency_operations.created_at desc
          limit 1
        ),
        existing_live_subscription as (
          select tribe_member_subscriptions.mercado_pago_preapproval_id as provider_subscription_id
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
            and tribe_member_subscriptions.status in ${LIVE_PROVIDER_SUBSCRIPTION_STATUSES}
          order by tribe_member_subscriptions.updated_at desc
          limit 1
        )
        select
          (select id from target_tribe) as tribe_id,
          (select id from current_price) as current_price_id,
          (select payment_integration_id from current_price) as current_price_payment_integration_id,
          (select amount_cents from current_price) as current_price_amount_cents,
          (select currency from current_price) as current_price_currency,
          (select name from current_price) as current_price_name,
          (select mercado_pago_preapproval_plan_id from current_price) as current_price_provider_plan_id,
          exists (select 1 from active_invitation) as has_active_invitation,
          (select status from existing_membership) as existing_membership_status,
          (select status_reason from existing_membership) as existing_membership_status_reason,
          exists (select 1 from retry_blocking_member_subscription) as has_retry_blocking_member_subscription,
          (select subscription_id from existing_pending_checkout) as existing_checkout_subscription_id,
          (select checkout_url from existing_pending_checkout) as existing_checkout_url,
          (select provider_subscription_id from existing_pending_checkout) as existing_provider_subscription_id,
          (select provider_subscription_id from existing_live_subscription) as existing_live_provider_subscription_id,
          public.current_app_user_email() as current_user_email,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        cross join checkout_context
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.id = (select payment_integration_id from current_price)
          and tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as SubscriptionStartContextRow | null;
    });

    if (input.requiresActiveInvitation && !context?.has_active_invitation) {
      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.invalidInvitation,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.invalidInvitation };
    }

    const hasRetryBlockingMemberSubscription =
      context?.has_retry_blocking_member_subscription === true;
    const hasRecoverablePaymentMembership =
      (context?.existing_membership_status ===
        MEMBER_SUBSCRIPTION_RECOVERY_MEMBERSHIP_STATUS.blocked &&
        context.existing_membership_status_reason ===
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked) ||
      (context?.existing_membership_status ===
        MEMBER_SUBSCRIPTION_RECOVERY_MEMBERSHIP_STATUS.removed &&
        context.existing_membership_status_reason ===
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive &&
        !hasRetryBlockingMemberSubscription);

    if (
      !input.requiresActiveInvitation &&
      !input.allowOpenJoin &&
      !hasRecoverablePaymentMembership
    ) {
      const retryRejectionStatus =
        context?.existing_membership_status ===
          MEMBER_SUBSCRIPTION_RECOVERY_MEMBERSHIP_STATUS.blocked &&
        context.existing_membership_status_reason !==
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked
          ? TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked
          : TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked;

      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: retryRejectionStatus,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey,
          priceId: context?.current_price_id,
          providerPlanId: context?.current_price_provider_plan_id,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return { status: retryRejectionStatus };
    }

    if (
      !context?.current_price_id ||
      !context.current_price_provider_plan_id ||
      context.current_price_amount_cents === null ||
      !context.current_price_currency ||
      !context.current_price_name
    ) {
      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey,
          priceId: context?.current_price_id,
          providerPlanId: context?.current_price_provider_plan_id,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice };
    }

    if (!context.current_user_email) {
      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey,
          priceId: context.current_price_id,
          providerPlanId: context.current_price_provider_plan_id,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked };
    }

    if (
      context.existing_membership_status ===
        MEMBER_SUBSCRIPTION_RECOVERY_MEMBERSHIP_STATUS.blocked &&
      context.existing_membership_status_reason !==
        TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked
    ) {
      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey,
          priceId: context.current_price_id,
          providerPlanId: context.current_price_provider_plan_id,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked };
    }

    if (context.existing_live_provider_subscription_id) {
      const alreadyActiveOperationKey = buildMemberSubscriptionOperationKey({
        operation:
          MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.startSubscriptionAlreadyActive,
        providerSubscriptionId: context.existing_live_provider_subscription_id,
        tribeSlug: input.tribeSlug,
      });

      await this.reconcileMembershipForExistingLiveSubscription(
        context.existing_live_provider_subscription_id
      );

      logMemberSubscriptionPaymentResult({
        operation:
          MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckoutAlreadyActive,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.alreadySubscribed,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey: alreadyActiveOperationKey,
          preapprovalId: context.existing_live_provider_subscription_id,
          priceId: context.current_price_id,
          providerPlanId: context.current_price_provider_plan_id,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.alreadySubscribed };
    }

    // Reuse an in-flight checkout when the member already has a pending row that
    // is linked to a provider preapproval, regardless of whether the tribe's
    // current price changed since the checkout was created. The linked
    // preapproval already encodes its own price/plan and a verified webhook can
    // activate the membership from it, so the member must be able to finish the
    // existing checkout. Tying reuse to a current-price match left a member whose
    // tribe switched its current price unable to either finish the linked
    // checkout or replace it (the partial unique index blocks reserving a second
    // pending row), falling through to payment_blocked instead.
    if (
      context.existing_checkout_url &&
      context.existing_provider_subscription_id
    ) {
      await this.updatePendingCheckoutInvitationAttribution({
        invitationTokenHash: input.invitationTokenHash,
        tribeId: context.tribe_id,
      });

      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey,
          preapprovalId: context.existing_provider_subscription_id,
          priceId: context.current_price_id,
          providerPlanId: context.current_price_provider_plan_id,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return {
        checkoutUrl: context.existing_checkout_url,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      };
    }

    // A pending reservation that has a stored checkout URL but no linked provider
    // subscription is a stale reservation that never reached a provider
    // preapproval: cancel it so a fresh provider preapproval can be created for
    // the current price. A reservation that is already linked to a preapproval is
    // reused above instead, even across a current-price change.
    const reusableCheckoutSubscriptionId =
      context.existing_checkout_subscription_id &&
      context.existing_checkout_url &&
      !context.existing_provider_subscription_id
        ? context.existing_checkout_subscription_id
        : null;
    if (reusableCheckoutSubscriptionId) {
      await this.cancelPendingSubscriptionReservation({
        subscriptionId: reusableCheckoutSubscriptionId,
        tribeId: context.tribe_id,
      });
    }

    const reservation = await this.reservePendingSubscription({
      currentPriceId: context.current_price_id,
      paymentIntegrationId: context.current_price_payment_integration_id,
      invitationTokenHash: input.invitationTokenHash,
      tribeId: context.tribe_id,
    });

    // The reservation only returns a stored checkout URL for a pending row of the
    // current price that already issued a provider checkout, so it is safe to
    // reuse without re-creating a provider preapproval.
    if (reservation.checkout_url) {
      await this.updatePendingCheckoutInvitationAttribution({
        invitationTokenHash: input.invitationTokenHash,
        tribeId: context.tribe_id,
      });

      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey,
          priceId: context.current_price_id,
          providerPlanId: context.current_price_provider_plan_id,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return {
        checkoutUrl: reservation.checkout_url,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      };
    }

    if (!reservation.reserved_subscription_id) {
      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey,
          priceId: context.current_price_id,
          providerPlanId: context.current_price_provider_plan_id,
          requestId: this.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked };
    }

    const checkoutTraceContext = buildMemberSubscriptionPaymentTraceContext({
      operationKey,
      priceId: context.current_price_id,
      providerPlanId: context.current_price_provider_plan_id,
      requestId: this.requestId,
      tribeSlug: input.tribeSlug,
    });

    // Resolve the provider access token and create the preapproval through the
    // API so the authoritative preapproval id is known before the redirect. This
    // is the core of the fix: the provider subscription is linked to the local
    // pending row up front, so a verified webhook can activate the membership
    // even if the member never returns to the app from the provider checkout.
    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: context.access_token,
        paymentIntegrationId: context.current_price_payment_integration_id,
        refreshToken: context.refresh_token,
        tokenExpiresAt: context.token_expires_at,
        tribeId: context.tribe_id,
      },
    }).catch(() => null);

    if (!accessToken) {
      // Release the just-reserved pending row so an immediate retry can reserve
      // again instead of waiting out the stale-reservation window.
      await this.cancelPendingSubscriptionReservation({
        subscriptionId: reservation.reserved_subscription_id,
        tribeId: context.tribe_id,
      });

      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
        traceContext: checkoutTraceContext,
      });

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked };
    }

    let providerSubscription: {
      checkoutUrl: string;
      providerSubscriptionId: string;
    };
    try {
      providerSubscription = await this.createMercadoPagoPreapprovalSubscription({
        accessToken,
        amountCents: context.current_price_amount_cents,
        backUrl:
          resolvePublicAppBaseUrl() + ROUTES.tribes.bySlug(input.tribeSlug),
        currency: context.current_price_currency,
        externalReference: buildPriceExternalReference(context.current_price_id),
        idempotencyKey:
          MEMBER_SUBSCRIPTION_PREAPPROVAL_IDEMPOTENCY_PREFIX +
          reservation.reserved_subscription_id,
        payerEmail: context.current_user_email,
        preapprovalPlanId: context.current_price_provider_plan_id,
        reason: context.current_price_name,
        ...(checkoutTraceContext
          ? { traceContext: checkoutTraceContext }
          : {}),
      });
    } catch {
      // A provider timeout or rejection leaves the reserved pending row orphaned
      // with no checkout URL or linked preapproval. Release it so an immediate
      // retry can reserve a fresh row instead of being blocked until the
      // stale-reservation window expires.
      await this.cancelPendingSubscriptionReservation({
        subscriptionId: reservation.reserved_subscription_id,
        tribeId: context.tribe_id,
      });

      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
        traceContext: checkoutTraceContext,
      });

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked };
    }

    // Persist the checkout first so the authoritative preapproval id is linked
    // onto the local pending row before anything else runs. The back URL update
    // below is a provider network round-trip; if Mercado Pago delivers the
    // subscription webhook during that window, handleWebhook can only find the
    // row by mercado_pago_preapproval_id, so the link must happen before the
    // PUT to avoid a retryable_webhook/503 for an otherwise valid payment that
    // the provider might not retry.
    const checkoutResult = await this.persistReservedPlanCheckout({
      checkoutUrl: providerSubscription.checkoutUrl,
      invitationTokenHash: input.invitationTokenHash,
      operationKey,
      priceId: context.current_price_id,
      providerPlanId: context.current_price_provider_plan_id,
      providerSubscriptionId: providerSubscription.providerSubscriptionId,
      requestId: this.requestId,
      reservedSubscriptionId: reservation.reserved_subscription_id,
      tribeId: context.tribe_id,
      tribeSlug: input.tribeSlug,
    });

    // The preapproval was created with a bare tribe back URL because the
    // authoritative preapproval_id is only known after creation. Link it back
    // into the back URL now, before the redirect, so an immediate return (the
    // buyer lands on /slug before the webhook lands) still carries the id and
    // the tribe page runs its pending-return handling instead of falling
    // through to the blocked/hidden state. This is best-effort UX hardening:
    // the local row is already linked above and the verified webhook already
    // activates the membership, so a failed update must not block the redirect.
    await this.linkSubscriptionReturnBackUrl({
      accessToken,
      providerSubscriptionId: providerSubscription.providerSubscriptionId,
      traceContext: checkoutTraceContext,
      tribeSlug: input.tribeSlug,
    });

    return checkoutResult;
  }

  /**
   * Links the authoritative preapproval id into the provider back URL after the
   * subscription is created, before the checkout redirect.
   *
   * Best-effort: a provider failure here only degrades the return experience to
   * the bare back URL, while the verified webhook still activates the
   * membership, so the failure is logged and swallowed instead of blocking the
   * checkout redirect.
   *
   * @param input - Provider access token, created preapproval id, trace context, and tribe slug.
   * @returns Promise that resolves after the back URL link is attempted.
   */
  private async linkSubscriptionReturnBackUrl(input: {
    accessToken: string;
    providerSubscriptionId: string;
    traceContext?: PaymentOperationTraceContext;
    tribeSlug: string;
  }): Promise<void> {
    const backUrl =
      resolvePublicAppBaseUrl() +
      buildProviderSubscriptionReturnPath({
        providerSubscriptionId: input.providerSubscriptionId,
        tribeSlug: input.tribeSlug,
      });

    await this.updateMercadoPagoPreapprovalBackUrl({
      accessToken: input.accessToken,
      backUrl,
      preapprovalId: input.providerSubscriptionId,
      ...(input.traceContext ? { traceContext: input.traceContext } : {}),
    }).catch((error: unknown) => {
      logPaymentOperation({
        context: input.traceContext,
        error,
        level: SERVER_LOG_LEVEL.warn,
        message: MEMBER_SUBSCRIPTION_PAYMENT_LOG.returnBackUrlLinkFailedMessage,
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.linkReturnBackUrl,
        preapprovalId: input.providerSubscriptionId,
        result: MEMBER_SUBSCRIPTION_BACK_URL_LINK_RESULT.failed,
      });
    });
  }

  /**
   * Cancels a pending checkout reservation that has no linked provider preapproval.
   *
   * Used both to replace a stale reusable reservation before issuing a new
   * provider URL and to release a just-reserved row when provider checkout
   * creation fails, so an immediate retry is not blocked by the orphaned pending
   * row until the stale-reservation window expires.
   *
   * @param input - Existing pending subscription identifiers.
   * @returns Canceled subscription id, or null when the reservation is no longer cancelable.
   */
  private async cancelPendingSubscriptionReservation(input: {
    subscriptionId: string;
    tribeId: string | null;
  }): Promise<string | null> {
    if (!input.tribeId) {
      return null;
    }

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled},
          status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
          updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${input.subscriptionId}
          and tribe_member_subscriptions.tribe_id = ${input.tribeId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is null
        returning id
      `);

      return ((result.rows?.[0] ?? null) as { id?: string } | null)?.id ?? null;
    });
  }

  /**
   * Updates pending membership invitation attribution before reusing a checkout URL.
   *
   * @param input - Invitation token hash and tribe identity used to resolve the active invitation.
   * @returns Promise that resolves after the pending membership attribution update is attempted.
   */
  private async updatePendingCheckoutInvitationAttribution(input: {
    invitationTokenHash: string;
    tribeId: string | null;
  }): Promise<void> {
    if (!input.tribeId) {
      return;
    }

    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        with checkout_context as (
          select set_config(
            ${SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName},
            ${input.invitationTokenHash},
            true
          )
        ),
        target_invitation as (
          select tribe_invitations.id
          from public.tribe_invitations
          cross join checkout_context
          where tribe_invitations.tribe_id = ${input.tribeId}
            and tribe_invitations.token_hash = nullif(
              current_setting(
                ${SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName},
                true
              ),
              ''
            )
            and tribe_invitations.status = 'active'
          limit 1
        )
        update public.tribe_members
        set joined_via_invitation_id = target_invitation.id
        from target_invitation
        where tribe_members.tribe_id = ${input.tribeId}
          and tribe_members.user_id = public.current_app_user_id()
          and tribe_members.status = 'blocked'
          and tribe_members.status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
      `);
    });
  }

  /**
   * Reserves a local pending subscription before creating the provider checkout.
   *
   * @param input - Current tribe price and invitation data used for the reservation.
   * @returns Existing checkout data or the reserved local subscription id.
   */
  private async reservePendingSubscription(input: {
    currentPriceId: string;
    invitationTokenHash: string;
    paymentIntegrationId: string | null;
    tribeId: string | null;
  }): Promise<SubscriptionReservationRow> {
    if (!input.tribeId) {
      return {
        checkout_url: null,
        reserved_subscription_id: null,
      };
    }

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with checkout_context as (
          select set_config(
            ${SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName},
            ${input.invitationTokenHash},
            true
          )
        ),
        target_invitation as (
          select tribe_invitations.id
          from public.tribe_invitations
          cross join checkout_context
          where tribe_invitations.tribe_id = ${input.tribeId}
            and tribe_invitations.token_hash = nullif(
              current_setting(
                ${SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName},
                true
              ),
              ''
            )
            and tribe_invitations.status = 'active'
          limit 1
        ),
        inserted_membership as (
          insert into public.tribe_members (
            tribe_id,
            user_id,
            role,
            status,
            status_reason,
            joined_via_invitation_id,
            created_at
          )
          select
            ${input.tribeId},
            public.current_app_user_id(),
            'tribemate',
            'blocked',
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
            (select id from target_invitation),
            timezone('utc', now())
          from checkout_context
          on conflict (tribe_id, user_id) do update
          set
            status = 'blocked',
            status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
            joined_via_invitation_id = coalesce(
              (select id from target_invitation),
              tribe_members.joined_via_invitation_id
            )
          where (
              tribe_members.status = 'removed'
              and tribe_members.status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive}
            )
            or (
              tribe_members.status = 'blocked'
              and tribe_members.status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
            )
          returning id
        ),
        reserved_subscription as (
          insert into public.tribe_member_subscriptions (
            tribe_id,
            user_id,
            price_id,
            payment_integration_id,
            status,
            status_reason,
            created_at,
            updated_at
          )
          select
            ${input.tribeId},
            public.current_app_user_id(),
            ${input.currentPriceId},
            ${input.paymentIntegrationId},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
            timezone('utc', now()),
            timezone('utc', now())
          from checkout_context
          on conflict do nothing
          returning id
        ),
        existing_recoverable_reservation as (
          select tribe_member_subscriptions.id
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.tribe_id = ${input.tribeId}
            and tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
            and tribe_member_subscriptions.mercado_pago_preapproval_id is null
            and tribe_member_subscriptions.updated_at <
              timezone('utc', now()) - ${SUBSCRIPTION_RESERVATION.staleReservationInterval}::interval
          limit 1
          for update skip locked
        ),
        claimed_recoverable_reservation as (
          update public.tribe_member_subscriptions
          set updated_at = timezone('utc', now())
          where tribe_member_subscriptions.id = (
            select id from existing_recoverable_reservation
          )
            and not exists (select 1 from reserved_subscription)
          returning id
        ),
        existing_pending_checkout as (
          select subscription_idempotency_operations.response_body->>'checkoutUrl' as checkout_url
          from public.subscription_idempotency_operations
          where subscription_idempotency_operations.tribe_id = ${input.tribeId}
            and subscription_idempotency_operations.user_id = public.current_app_user_id()
            and subscription_idempotency_operations.operation_type = 'start_member_subscription'
            and subscription_idempotency_operations.response_body ? 'checkoutUrl'
            and exists (
              select 1
              from public.tribe_member_subscriptions
              where tribe_member_subscriptions.tribe_id = ${input.tribeId}
                and tribe_member_subscriptions.user_id = public.current_app_user_id()
                and tribe_member_subscriptions.product_key = ${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
                and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
                and tribe_member_subscriptions.price_id = ${input.currentPriceId}
                and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
            )
          order by subscription_idempotency_operations.created_at desc
          limit 1
        )
        select
          coalesce(
            (select id from reserved_subscription),
            (select id from claimed_recoverable_reservation)
          ) as reserved_subscription_id,
          (select checkout_url from existing_pending_checkout) as checkout_url
      `);

      return (result.rows?.[0] ?? {
        checkout_url: null,
        reserved_subscription_id: null,
      }) as SubscriptionReservationRow;
    });
  }

  /**
   * Links the provider preapproval to the reserved row and persists the checkout
   * idempotently before redirecting to Mercado Pago.
   *
   * The provider subscription id is attached to the reserved pending row up front
   * so a verified webhook can match and activate it without depending on the
   * member returning to the app from the provider checkout.
   *
   * @param input - Provider preapproval checkout data and local subscription identity.
   * @returns Start result containing the checkout URL.
   */
  private async persistReservedPlanCheckout(input: {
    checkoutUrl: string;
    invitationTokenHash: string;
    operationKey: string;
    priceId: string;
    providerPlanId: string;
    providerSubscriptionId: string;
    requestId?: string;
    reservedSubscriptionId: string;
    tribeId: string | null;
    tribeSlug: string;
  }): Promise<TribeMemberSubscriptionStartResult> {
    return this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          mercado_pago_preapproval_id = ${input.providerSubscriptionId},
          updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${input.reservedSubscriptionId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is null
      `);

      await database.execute(sql`
        with checkout_context as (
          select set_config(
            ${SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName},
            ${input.invitationTokenHash},
            true
          )
        ),
        target_invitation as (
          select tribe_invitations.id
          from public.tribe_invitations
          cross join checkout_context
          where tribe_invitations.tribe_id = ${input.tribeId}
            and tribe_invitations.token_hash = nullif(
              current_setting(
                ${SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName},
                true
              ),
              ''
            )
            and tribe_invitations.status = 'active'
          limit 1
        )
        insert into public.tribe_members (
          tribe_id,
          user_id,
          role,
          status,
          status_reason,
          joined_via_invitation_id,
          created_at
        )
        select
          ${input.tribeId},
          public.current_app_user_id(),
          'tribemate',
          'blocked',
          ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
          (select id from target_invitation),
          timezone('utc', now())
        from checkout_context
        on conflict (tribe_id, user_id) do update
        set
          status = 'blocked',
          status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
          joined_via_invitation_id = coalesce(
            (select id from target_invitation),
            tribe_members.joined_via_invitation_id
          )
        where (
            tribe_members.status = 'removed'
            and tribe_members.status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive}
          )
          or (
            tribe_members.status = 'blocked'
            and tribe_members.status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
          )
      `);

      await database.execute(sql`
        insert into public.subscription_idempotency_operations (
          operation_key,
          operation_type,
          tribe_id,
          user_id,
          payload_hash,
          response_body,
          created_at
        )
        values (
          ${input.operationKey},
          'start_member_subscription',
          ${input.tribeId},
          public.current_app_user_id(),
          ${hashPayload({ tribeSlug: input.tribeSlug })},
          ${JSON.stringify({
            checkoutUrl: input.checkoutUrl,
            preapprovalPlanId: input.providerPlanId,
          })}::jsonb,
          timezone('utc', now())
        )
        on conflict (operation_key) do update
        set
          payload_hash = excluded.payload_hash,
          response_body = excluded.response_body,
          created_at = excluded.created_at
        where subscription_idempotency_operations.operation_type = excluded.operation_type
          and subscription_idempotency_operations.tribe_id = excluded.tribe_id
          and subscription_idempotency_operations.user_id = excluded.user_id
      `);

      logMemberSubscriptionPaymentResult({
        operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION.startCheckout,
        result: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
        traceContext: buildMemberSubscriptionPaymentTraceContext({
          operationKey: input.operationKey,
          priceId: input.priceId,
          providerPlanId: input.providerPlanId,
          requestId: input.requestId,
          tribeSlug: input.tribeSlug,
        }),
      });

      return {
        checkoutUrl: input.checkoutUrl,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      };
    });
  }

  /**
   * Records a Mercado Pago webhook once and reconciles a coarse subscription state.
   *
   * @param command - Webhook identity and resource data.
   * @returns Webhook processing status.
   */
  async handleWebhook(
    command: MercadoPagoSubscriptionWebhookCommand
  ): Promise<TribeMemberSubscriptionWebhookResult> {
    return this.executeWithDatabase(async (database) => {
      const payloadHash = hashPayload({
        resourceId: command.resourceId,
        topic: command.topic,
      });
      const result = await database.execute(sql`
        select
          tribe_payment_integrations.id as payment_integration_id,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          tribe_member_subscriptions.price_id,
          tribe_member_subscriptions.tribe_id,
          tribe_member_subscriptions.status as local_status,
          tribe_member_subscriptions.status_reason as local_status_reason,
          true as subscription_found
        from public.tribe_member_subscriptions
        left join public.tribe_subscription_prices
          on tribe_subscription_prices.id = tribe_member_subscriptions.price_id
        inner join public.tribe_payment_integrations
          on tribe_payment_integrations.id = coalesce(
            tribe_member_subscriptions.payment_integration_id,
            tribe_subscription_prices.payment_integration_id
          )
          and tribe_payment_integrations.tribe_id = tribe_member_subscriptions.tribe_id
          and tribe_payment_integrations.provider = 'mercado_pago'
        where tribe_member_subscriptions.mercado_pago_preapproval_id = ${command.resourceId}
        limit 1
      `);
      const context = (result.rows?.[0] ?? null) as
        | WebhookSubscriptionContextRow
        | null;

      if (!context?.subscription_found) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.retryableWebhook };
      }

      const accessToken = await resolveMercadoPagoAccessToken({
        executeWithDatabase: this.executeWithDatabase,
        refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
        storedToken: {
          accessToken: context.access_token,
          paymentIntegrationId: context.payment_integration_id,
          refreshToken: context.refresh_token,
          tokenExpiresAt: context.token_expires_at,
          tribeId: context.tribe_id,
        },
      });

      if (!accessToken) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.retryableWebhook };
      }

      const operationKeyPrefix = `${MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.webhook}:${command.resourceId}`;
      const traceContext = buildMemberSubscriptionPaymentTraceContext({
        operationKey: operationKeyPrefix,
        preapprovalId: command.resourceId,
        priceId: context.price_id,
        requestId: this.requestId,
      });
      const providerStatus = await this.getMercadoPagoPreapprovalStatus({
        accessToken,
        preapprovalId: command.resourceId,
        ...(traceContext ? { traceContext } : {}),
      });
      const subscriptionStatus =
        mapMercadoPagoSubscriptionStatus(providerStatus);
      await lockSubscriptionMembershipTribes(database,{providerSubscriptionId:command.resourceId});
      const currentResult=await database.execute<{local_status:string;local_status_reason:string}>(sql`
        select status as local_status,status_reason as local_status_reason
        from public.tribe_member_subscriptions where mercado_pago_preapproval_id=${command.resourceId}
      `);
      const currentSubscription=currentResult.rows[0];
      if(!currentSubscription) return {status:TRIBE_MEMBER_SUBSCRIPTION_STATUS.retryableWebhook};
      const operationKey = [
        operationKeyPrefix,
        subscriptionStatus.status,
        subscriptionStatus.statusReason,
      ].join(":");

      const operationResult = await database.execute(sql`
        insert into public.subscription_idempotency_operations (
          operation_key,
          operation_type,
          payload_hash,
          response_body,
          created_at
        )
        values (
          ${operationKey},
          'mercado_pago_webhook',
          ${payloadHash},
          '{}'::jsonb,
          timezone('utc', now())
        )
        on conflict (operation_key) do nothing
        returning id as operation_inserted
      `);
      const operation = (operationResult.rows?.[0] ?? null) as
        | WebhookOperationInsertRow
        | null;

      // Safeguard against state oscillation (e.g. authorized → paused →
      // authorized). When the key already exists but the stored local state no
      // longer matches the target, apply the change anyway.
      if (
        !operation?.operation_inserted &&
        currentSubscription.local_status === subscriptionStatus.status &&
        currentSubscription.local_status_reason === subscriptionStatus.statusReason
      ) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook };
      }

      await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          status = ${subscriptionStatus.status},
          status_reason = ${subscriptionStatus.statusReason},
          updated_at = timezone('utc', now())
        where mercado_pago_preapproval_id = ${command.resourceId}
      `);

      await this.updateMembershipAccessForProviderSubscription(
        database,
        command.resourceId
      );

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed };
    });
  }

  private async reconcileMembershipForExistingLiveSubscription(
    providerSubscriptionId: string
  ): Promise<void> {
    await this.executeWithDatabase(async(database)=>{
      await lockSubscriptionMembershipTribes(database,{providerSubscriptionId});
      await this.updateMembershipAccessForProviderSubscription(database,providerSubscriptionId);
    });
  }

  /**
   * Reconciles basic access only from current membership-product subscriptions.
   * @param database - The caller's guarded transaction, after verified provider state was persisted.
   * @param providerSubscriptionId - Own stored provider reference that identifies affected members.
   * @returns Nothing after the scoped membership update; no RPC runs under its locks.
   */
  private async updateMembershipAccessForProviderSubscription(
    database: RequestDatabase,
    providerSubscriptionId: string
  ): Promise<void> {
    await database.execute(sql`
      with target_subscription as (
        select tribe_id,user_id from public.tribe_member_subscriptions
        where mercado_pago_preapproval_id=${providerSubscriptionId}
          and product_key=${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
      ),
      target_tribe as (
        select tribes.id from public.tribes
        where tribes.id in(select tribe_id from target_subscription)
        order by tribes.id
      ),
      affected_members as (
        select distinct subscription.tribe_id,subscription.user_id from target_subscription subscription
        inner join target_tribe on target_tribe.id=subscription.tribe_id
      ),
      reconciled_subscriptions as (
        select subscription.id,subscription.tribe_id,subscription.user_id,subscription.price_id,subscription.status,subscription.product_key
        from public.tribe_member_subscriptions subscription inner join target_tribe on target_tribe.id=subscription.tribe_id
      )
      ${buildSubscriptionMembershipUpdateSql()}
    `);
  }
}
