/**
 * Persists member subscriptions and webhook idempotency in Postgres.
 *
 * @module postgres-tribe-member-subscription-repository
 */

import { createHash } from "crypto";

import { sql } from "drizzle-orm";

import type {
  TribeMemberSubscriptionStartResult,
  TribeMemberSubscriptionStatusResult,
  TribeMemberSubscriptionWebhookResult,
} from "@/src/modules/subscriptions/application/results/tribe-member-subscription-result";
import {
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  MercadoPagoSubscriptionWebhookCommand,
  PendingSubscriptionReturnQuery,
  ProviderSubscriptionReturnPathQuery,
  RetryCurrentPriceSubscriptionPaymentCommand,
  StartCurrentPriceSubscriptionCommand,
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
import {
  resolveMercadoPagoAccessToken,
  type MercadoPagoAccessTokenRefresher,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";
import {
  MERCADO_PAGO_SUBSCRIPTION_STATUS,
  mapMercadoPagoSubscriptionStatus,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-status-mapper";
import { ROUTES } from "@/src/constants/routes";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MercadoPagoPreapprovalStatusGetter = (
  input: MercadoPagoPreapprovalStatusInput
) => Promise<string | null>;

type MercadoPagoPlanCheckoutUrlBuilder = (preapprovalPlanId: string) => string;

type MercadoPagoPreapprovalDetailsGetter = (
  input: MercadoPagoPreapprovalDetailsInput
) => Promise<MercadoPagoPreapprovalDetailsResult | null>;

type MercadoPagoPreapprovalStatusUpdater = (input: {
  accessToken: string;
  preapprovalId: string;
  status: "canceled";
  traceContext?: PaymentOperationTraceContext;
}) => Promise<string>;

type SubscriptionStartContextRow = {
  access_token: string | null;
  current_price_amount_cents: number | null;
  current_price_currency: string | null;
  current_price_id: string | null;
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
  existing_operation_id: string | null;
  price_id: string | null;
  refresh_token: string | null;
  subscription_found: boolean | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type StartSubscriptionCheckoutInput = {
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
  mercado_pago_preapproval_id: string | null;
  price_id: string | null;
  refresh_token: string | null;
  subscription_found: boolean | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PendingSubscriptionReturnAttachmentContextRow = {
  access_token: string | null;
  price_id: string | null;
  refresh_token: string | null;
  reserved_subscription_id: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type MissingSubscriptionReturnRecoveryContextRow = {
  access_token: string | null;
  current_price_id: string | null;
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

/**
 * Defines when an unfinished local checkout reservation can be retried.
 */
const SUBSCRIPTION_RESERVATION = {
  returnRecoveryInterval: "24 hours",
  staleReservationInterval: "5 minutes",
} as const;

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
  separator: ":",
  startSubscription: "member-plan-subscription",
  startSubscriptionAlreadyActive: "member-plan-subscription-already-active",
  webhook: "mercado-pago-webhook",
} as const;

const MEMBER_SUBSCRIPTION_PAYMENT_LOG = {
  completedMessage: "Member subscription payment operation completed",
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
  ].join(MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.separator);
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
 * Reads the Mercado Pago plan identifier from a stored checkout URL.
 *
 * @param checkoutUrl - Previously persisted checkout URL.
 * @returns Mercado Pago preapproval plan id, or null when the URL is not a plan checkout.
 */
function readProviderPlanIdFromCheckoutUrl(checkoutUrl: string): string | null {
  try {
    const parsedCheckoutUrl = new URL(checkoutUrl);
    const providerPlanId = parsedCheckoutUrl.searchParams
      .get("preapproval_plan_id")
      ?.trim();

    return providerPlanId || null;
  } catch {
    return null;
  }
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

export class PostgresTribeMemberSubscriptionRepository
  implements TribeMemberSubscriptionRepository
{
  /**
   * Creates a member subscription repository with provider adapters and trace context.
   *
   * @param executeWithDatabase - Request-scoped database executor.
   * @param buildMercadoPagoPlanCheckoutUrl - Adapter that builds provider checkout URLs.
   * @param getMercadoPagoPreapprovalDetails - Adapter that reads provider preapproval details.
   * @param getMercadoPagoPreapprovalStatus - Adapter that reads provider preapproval status.
   * @param updateMercadoPagoPreapprovalStatus - Adapter that updates provider preapproval status.
   * @param refreshMercadoPagoAccessToken - Adapter that refreshes provider tokens.
   * @param requestId - Optional request correlation identifier for payment traces.
   */
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly buildMercadoPagoPlanCheckoutUrl: MercadoPagoPlanCheckoutUrlBuilder,
    private readonly getMercadoPagoPreapprovalDetails: MercadoPagoPreapprovalDetailsGetter,
    private readonly getMercadoPagoPreapprovalStatus: MercadoPagoPreapprovalStatusGetter,
    private readonly updateMercadoPagoPreapprovalStatus: MercadoPagoPreapprovalStatusUpdater,
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
        refreshToken: context.refresh_token,
        tokenExpiresAt: context.token_expires_at,
        tribeId: context.tribe_id,
      },
    }).catch(() => null);

    if (!accessToken) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    let providerStatus: string | null;
    const operationKey = buildMemberSubscriptionOperationKey({
      operation: MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.confirmReturn,
      tribeSlug: query.tribeSlug,
    });
    const traceContext = buildMemberSubscriptionPaymentTraceContext({
      operationKey,
      preapprovalId: query.providerSubscriptionId,
      priceId: context.price_id,
      requestId: this.requestId,
      tribeSlug: query.tribeSlug,
    });

    try {
      providerStatus = await this.getMercadoPagoPreapprovalStatus({
        accessToken,
        preapprovalId: query.providerSubscriptionId,
        ...(traceContext ? { traceContext } : {}),
      });
    } catch {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    if (!providerStatus) {
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
            tribe_member_subscriptions.price_id,
            tribe_member_subscriptions.tribe_id,
            tribe_member_subscriptions.mercado_pago_preapproval_id
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
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
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          coalesce((select mercado_pago_preapproval_id from target_subscription), null) as mercado_pago_preapproval_id,
          coalesce((select price_id from target_subscription), null) as price_id,
          coalesce((select tribe_id from target_subscription), (select id from target_tribe)) as tribe_id,
          coalesce((select true from target_subscription), false) as subscription_found,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
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
            tribe_member_subscriptions.price_id
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          order by tribe_member_subscriptions.updated_at desc
          limit 1
        )
        select
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          (select price_id from pending_subscription) as price_id,
          (select id from pending_subscription) as reserved_subscription_id,
          tribe_payment_integrations.token_expires_at,
          (select id from target_tribe) as tribe_id
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
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
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.status = 'active'
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
            and position(
              'preapproval_plan_id=' || (select mercado_pago_preapproval_plan_id from current_price)
              in subscription_idempotency_operations.response_body->>'checkoutUrl'
            ) > 0
          limit 1
        )
        select
          tribe_payment_integrations.access_token,
          (select id from current_price) as current_price_id,
          (select mercado_pago_preapproval_plan_id from current_price) as current_price_provider_plan_id,
          exists (select 1 from recent_plan_checkout) as has_recent_plan_checkout,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at,
          (select id from target_tribe) as tribe_id
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
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

  private async startCurrentPriceSubscriptionCheckout(
    input: StartSubscriptionCheckoutInput
  ): Promise<TribeMemberSubscriptionStartResult> {
    const operationKey = [
      MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.startSubscription,
      input.tribeSlug,
      input.idempotencyKey,
    ].join(MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY.separator);

    const context = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
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
          select tribe_invitations.id
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
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.is_current = true
            and tribe_subscription_prices.status = 'active'
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
            and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
            and tribe_member_subscriptions.status in ${LIVE_PROVIDER_SUBSCRIPTION_STATUSES}
          order by tribe_member_subscriptions.updated_at desc
          limit 1
        )
        select
          (select id from target_tribe) as tribe_id,
          (select id from current_price) as current_price_id,
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
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
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
      (context?.existing_membership_status === "blocked" &&
        context.existing_membership_status_reason ===
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked) ||
      (context?.existing_membership_status === "removed" &&
        context.existing_membership_status_reason ===
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive &&
        !hasRetryBlockingMemberSubscription);

    if (!input.requiresActiveInvitation && !hasRecoverablePaymentMembership) {
      const retryRejectionStatus =
        context?.existing_membership_status === "blocked" &&
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
      context.existing_membership_status === "blocked" &&
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

    const existingCheckoutProviderPlanId = context.existing_checkout_url
      ? readProviderPlanIdFromCheckoutUrl(context.existing_checkout_url)
      : null;

    if (
      context.existing_checkout_url &&
      existingCheckoutProviderPlanId === context.current_price_provider_plan_id
    ) {
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

    const shouldReplaceExistingCheckout =
      context.existing_checkout_subscription_id &&
      context.existing_checkout_url;
    const reservation = shouldReplaceExistingCheckout
      ? {
          checkout_url: null,
          reserved_subscription_id: context.existing_checkout_subscription_id,
        }
      : await this.reservePendingSubscription({
          currentPriceId: context.current_price_id,
          invitationTokenHash: input.invitationTokenHash,
          tribeId: context.tribe_id,
        });

    if (reservation.checkout_url) {
      const reservationCheckoutProviderPlanId = readProviderPlanIdFromCheckoutUrl(
        reservation.checkout_url
      );

      if (
        reservationCheckoutProviderPlanId ===
        context.current_price_provider_plan_id
      ) {
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

    const checkoutUrl = this.buildMercadoPagoPlanCheckoutUrl(
      context.current_price_provider_plan_id
    );

    return this.persistReservedPlanCheckout({
      checkoutUrl,
      operationKey,
      priceId: context.current_price_id,
      providerPlanId: context.current_price_provider_plan_id,
      requestId: this.requestId,
      tribeId: context.tribe_id,
      tribeSlug: input.tribeSlug,
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
        inserted_membership as (
          insert into public.tribe_members (
            tribe_id,
            user_id,
            role,
            status,
            status_reason,
            created_at
          )
          select
            ${input.tribeId},
            public.current_app_user_id(),
            'tribemate',
            'blocked',
            ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
            timezone('utc', now())
          from checkout_context
          on conflict (tribe_id, user_id) do update
          set
            status = 'blocked',
            status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
          where tribe_members.status = 'removed'
            and tribe_members.status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive}
          returning id
        ),
        reserved_subscription as (
          insert into public.tribe_member_subscriptions (
            tribe_id,
            user_id,
            price_id,
            status,
            status_reason,
            created_at,
            updated_at
          )
          select
            ${input.tribeId},
            public.current_app_user_id(),
            ${input.currentPriceId},
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
                and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
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
   * Persists the provider plan checkout idempotently before redirecting to Mercado Pago.
   *
   * @param input - Provider plan checkout data and local subscription identity.
   * @returns Start result containing the checkout URL.
   */
  private async persistReservedPlanCheckout(input: {
    checkoutUrl: string;
    operationKey: string;
    priceId: string;
    providerPlanId: string;
    requestId?: string;
    tribeId: string | null;
    tribeSlug: string;
  }): Promise<TribeMemberSubscriptionStartResult> {
    return this.executeWithDatabase(async (database) => {
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
          ${JSON.stringify({ checkoutUrl: input.checkoutUrl })}::jsonb,
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
      const operationKey = `mercado-pago-webhook:${command.eventId}`;
      const payloadHash = hashPayload({
        resourceId: command.resourceId,
        topic: command.topic,
      });
      const result = await database.execute(sql`
        with subscription_context as (
          select
            tribe_payment_integrations.access_token,
            tribe_payment_integrations.refresh_token,
            tribe_payment_integrations.token_expires_at,
            tribe_member_subscriptions.price_id,
            tribe_member_subscriptions.tribe_id,
            true as subscription_found
          from public.tribe_member_subscriptions
          inner join public.tribe_payment_integrations
            on tribe_payment_integrations.tribe_id = tribe_member_subscriptions.tribe_id
            and tribe_payment_integrations.provider = 'mercado_pago'
          where tribe_member_subscriptions.mercado_pago_preapproval_id = ${command.resourceId}
          limit 1
        ),
        existing_operation as (
          select subscription_idempotency_operations.id
          from public.subscription_idempotency_operations
          where subscription_idempotency_operations.operation_key = ${operationKey}
          limit 1
        )
        select
          (select id from existing_operation) as existing_operation_id,
          (select access_token from subscription_context) as access_token,
          (select refresh_token from subscription_context) as refresh_token,
          (select token_expires_at from subscription_context) as token_expires_at,
          (select price_id from subscription_context) as price_id,
          (select tribe_id from subscription_context) as tribe_id,
          coalesce((select subscription_found from subscription_context), false) as subscription_found
      `);
      const context = (result.rows?.[0] ?? null) as
        | WebhookSubscriptionContextRow
        | null;

      if (!context?.subscription_found) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.retryableWebhook };
      }

      if (context.existing_operation_id) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook };
      }

      const accessToken = await resolveMercadoPagoAccessToken({
        executeWithDatabase: this.executeWithDatabase,
        refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
        storedToken: {
          accessToken: context.access_token,
          refreshToken: context.refresh_token,
          tokenExpiresAt: context.token_expires_at,
          tribeId: context.tribe_id,
        },
      });

      if (!accessToken) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.retryableWebhook };
      }

      const traceContext = buildMemberSubscriptionPaymentTraceContext({
        operationKey,
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

      if (!operation?.operation_inserted) {
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
    await this.executeWithDatabase((database) =>
      this.updateMembershipAccessForProviderSubscription(
        database,
        providerSubscriptionId
      )
    );
  }

  private async updateMembershipAccessForProviderSubscription(
    database: RequestDatabase,
    providerSubscriptionId: string
  ): Promise<void> {
    await database.execute(sql`
      update public.tribe_members
      set
        status = case
        when exists (
          select 1
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
            and tribe_member_subscriptions.user_id = tribe_members.user_id
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
        ) then 'active'
        when exists (
          select 1
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
            and tribe_member_subscriptions.user_id = tribe_members.user_id
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
        ) then 'blocked'
        else 'removed'
      end,
        status_reason = case
        when exists (
          select 1
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
            and tribe_member_subscriptions.user_id = tribe_members.user_id
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
        ) then ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none}
        when exists (
          select 1
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
            and tribe_member_subscriptions.user_id = tribe_members.user_id
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
        ) then ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
        else ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive}
      end
      where exists (
        select 1
        from public.tribe_member_subscriptions
        where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
          and tribe_member_subscriptions.user_id = tribe_members.user_id
          and tribe_member_subscriptions.mercado_pago_preapproval_id = ${providerSubscriptionId}
      )
        and not (
          tribe_members.status = 'blocked'
          and tribe_members.status_reason <> ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
        )
    `);
  }
}
