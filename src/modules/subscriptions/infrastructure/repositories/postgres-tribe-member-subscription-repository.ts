/**
 * Persists member subscriptions and webhook idempotency in Postgres.
 *
 * @module postgres-tribe-member-subscription-repository
 */

import { createHash } from "crypto";

import { sql as kyselySql } from "kysely";

import type {
  TribeMemberSubscriptionStartResult,
  TribeMemberSubscriptionStatusResult,
  TribeMemberSubscriptionWebhookResult,
} from "@/src/modules/subscriptions/application/results/tribe-member-subscription-result";
import {
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
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

const SUBSCRIPTION_CHECKOUT_CONTEXT = {
  invitationSettingName: "app.current_invitation_hash",
  settingName: "app.subscription_checkout_tribe_id",
} as const;

const SUBSCRIPTION_RETURN_QUERY = {
  mercadoPagoPreapprovalId: "preapproval_id",
} as const;

const SUBSCRIPTION_RESERVATION = {
  returnRecoveryInterval: "24 hours",
  staleReservationWindowMilliseconds: 5 * 60 * 1000,
} as const;

/**
 * Local statuses that represent a live provider preapproval blocking another checkout.
 */
const CURRENT_MEMBER_SUBSCRIPTION_STATUS_VALUES = [
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.active,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.gracePeriod,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.pastDue,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused,
] as const;

const MEMBER_SUBSCRIPTION_PAYMENT_OPERATION = {
  cancelSubscription: "cancel-member-subscription",
  confirmReturn: "confirm-member-subscription-return",
  reconcileSubscription: "reconcile-member-subscription",
  startCheckout: "start-member-subscription-checkout",
  webhook: "mercado-pago-webhook",
} as const;

const MEMBER_SUBSCRIPTION_PAYMENT_OPERATION_KEY = {
  cancelSubscription: "cancel-member-subscription",
  confirmReturn: "confirm-member-subscription-return",
  reconcileSubscription: "reconcile-member-subscription",
  separator: ":",
  startSubscription: "member-plan-subscription",
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
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        query.tribeSlug
      );

      if (!targetTribe) {
        return false;
      }

      const subscription = await database.kysely
        .selectFrom("tribe_member_subscriptions")
        .select("id")
        .where("tribe_id", "=", targetTribe.id)
        .where((expressionBuilder) =>
          expressionBuilder(
            "user_id",
            "=",
            expressionBuilder.fn<string>("public.current_app_user_id")
          )
        )
        .where("status", "=", TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending)
        .where(
          "mercado_pago_preapproval_id",
          "=",
          query.providerSubscriptionId
        )
        .limit(1)
        .executeTakeFirst();

      return Boolean(subscription);
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
      const matchingSubscription = await database.kysely
        .selectFrom("tribe_member_subscriptions")
        .innerJoin("tribes", "tribes.id", "tribe_member_subscriptions.tribe_id")
        .select("tribes.slug as tribe_slug")
        .where((expressionBuilder) =>
          expressionBuilder(
            "tribe_member_subscriptions.user_id",
            "=",
            expressionBuilder.fn<string>("public.current_app_user_id")
          )
        )
        .where(
          "tribe_member_subscriptions.mercado_pago_preapproval_id",
          "=",
          query.providerSubscriptionId
        )
        .where(
          "tribe_member_subscriptions.status",
          "in",
          CURRENT_MEMBER_SUBSCRIPTION_STATUS_VALUES
        )
        .orderBy("tribe_member_subscriptions.updated_at", "desc")
        .limit(1)
        .executeTakeFirst();
      const row = matchingSubscription
        ? matchingSubscription
        : await this.findSinglePendingPlanCheckoutReturnTribe(database.kysely);

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
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        input.tribeSlug
      );
      const row = targetTribe
        ? await database.kysely
            .selectFrom("tribe_member_subscriptions")
            .select("status")
            .where("tribe_id", "=", targetTribe.id)
            .where((expressionBuilder) =>
              expressionBuilder(
                "user_id",
                "=",
                expressionBuilder.fn<string>("public.current_app_user_id")
              )
            )
            .where(
              "mercado_pago_preapproval_id",
              "=",
              input.providerSubscriptionId
            )
            .orderBy("updated_at", "desc")
            .limit(1)
            .executeTakeFirst()
        : null;

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
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        input.tribeSlug
      );

      if (!targetTribe) {
        return null;
      }

      const [targetSubscription, paymentIntegration] = await Promise.all([
        database.kysely
          .selectFrom("tribe_member_subscriptions")
          .select(["price_id", "tribe_id", "mercado_pago_preapproval_id"])
          .where("tribe_id", "=", targetTribe.id)
          .where((expressionBuilder) =>
            expressionBuilder(
              "user_id",
              "=",
              expressionBuilder.fn<string>("public.current_app_user_id")
            )
          )
          .where("mercado_pago_preapproval_id", "is not", null)
          .$if(Boolean(input.providerSubscriptionId), (queryBuilder) =>
            queryBuilder.where(
              "mercado_pago_preapproval_id",
              "=",
              input.providerSubscriptionId
            )
          )
          .where("status", "in", CURRENT_MEMBER_SUBSCRIPTION_STATUS_VALUES)
          .orderBy("updated_at", "desc")
          .limit(1)
          .executeTakeFirst(),
        this.findMercadoPagoIntegration(database.kysely, targetTribe.id),
      ]);

      return {
        access_token: paymentIntegration?.access_token ?? null,
        mercado_pago_preapproval_id:
          targetSubscription?.mercado_pago_preapproval_id ?? null,
        price_id: targetSubscription?.price_id ?? null,
        refresh_token: paymentIntegration?.refresh_token ?? null,
        subscription_found: Boolean(targetSubscription),
        token_expires_at: paymentIntegration?.token_expires_at ?? null,
        tribe_id: targetSubscription?.tribe_id ?? targetTribe.id,
      };
    });
  }

  private async resolvePendingSubscriptionReturnAttachmentContext(input: {
    tribeSlug: string;
  }): Promise<PendingSubscriptionReturnAttachmentContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        input.tribeSlug
      );

      if (!targetTribe) {
        return null;
      }

      const [pendingSubscription, paymentIntegration] = await Promise.all([
        database.kysely
          .selectFrom("tribe_member_subscriptions")
          .select(["id", "price_id"])
          .where("tribe_id", "=", targetTribe.id)
          .where((expressionBuilder) =>
            expressionBuilder(
              "user_id",
              "=",
              expressionBuilder.fn<string>("public.current_app_user_id")
            )
          )
          .where("status", "=", TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending)
          .orderBy("updated_at", "desc")
          .limit(1)
          .executeTakeFirst(),
        this.findMercadoPagoIntegration(database.kysely, targetTribe.id),
      ]);

      return {
        access_token: paymentIntegration?.access_token ?? null,
        price_id: pendingSubscription?.price_id ?? null,
        refresh_token: paymentIntegration?.refresh_token ?? null,
        reserved_subscription_id: pendingSubscription?.id ?? null,
        token_expires_at: paymentIntegration?.token_expires_at ?? null,
        tribe_id: targetTribe.id,
      };
    });
  }

  private async resolveMissingSubscriptionReturnRecoveryContext(input: {
    tribeSlug: string;
  }): Promise<MissingSubscriptionReturnRecoveryContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        input.tribeSlug
      );

      if (!targetTribe) {
        return null;
      }

      const [currentPrice, paymentIntegration] = await Promise.all([
        database.kysely
          .selectFrom("tribe_subscription_prices")
          .select(["id", "mercado_pago_preapproval_plan_id"])
          .where("tribe_id", "=", targetTribe.id)
            .where("status", "=", TRIBE_SUBSCRIPTION_PRICE_STATUS.active)
          .where("is_current", "=", true)
          .limit(1)
          .executeTakeFirst(),
        this.findMercadoPagoIntegration(database.kysely, targetTribe.id),
      ]);
      const recentOperations = currentPrice?.mercado_pago_preapproval_plan_id
        ? await database.kysely
            .selectFrom("subscription_idempotency_operations")
            .select(["response_body", "created_at"])
            .where("tribe_id", "=", targetTribe.id)
            .where((expressionBuilder) =>
              expressionBuilder(
                "user_id",
                "=",
                expressionBuilder.fn<string>("public.current_app_user_id")
              )
            )
            .where("operation_type", "=", "start_member_subscription")
            .where(
              "created_at",
              ">=",
              kyselySql<Date>`timezone('utc', now()) - ${SUBSCRIPTION_RESERVATION.returnRecoveryInterval}::interval`
            )
            .orderBy("created_at", "desc")
            .execute()
        : [];
      const planId = currentPrice?.mercado_pago_preapproval_plan_id ?? null;
      const hasRecentPlanCheckout =
        Boolean(planId) &&
        recentOperations.some((operation) => {
          const checkoutUrl = this.readCheckoutUrl(operation.response_body);

          return checkoutUrl?.includes(`preapproval_plan_id=${planId}`) === true;
        });

      return {
        access_token: paymentIntegration?.access_token ?? null,
        current_price_id: currentPrice?.id ?? null,
        current_price_provider_plan_id: planId,
        has_recent_plan_checkout: hasRecentPlanCheckout,
        refresh_token: paymentIntegration?.refresh_token ?? null,
        token_expires_at: paymentIntegration?.token_expires_at ?? null,
        tribe_id: targetTribe.id,
      };
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
      await database.kysely
        .updateTable("tribe_member_subscriptions")
        .set((expressionBuilder) => ({
          status: subscriptionStatus.status,
          status_reason: subscriptionStatus.statusReason,
          updated_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
        }))
        .where("mercado_pago_preapproval_id", "=", input.providerSubscriptionId)
        .where((expressionBuilder) =>
          expressionBuilder(
            "user_id",
            "=",
            expressionBuilder.fn<string>("public.current_app_user_id")
          )
        )
        .execute();

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
      const updatedSubscription = await database.kysely
        .updateTable("tribe_member_subscriptions")
        .set((expressionBuilder) => ({
          mercado_pago_preapproval_id: input.providerSubscriptionId,
          status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
          status_reason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
          updated_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
        }))
        .where("id", "=", input.subscriptionId)
        .where((expressionBuilder) =>
          expressionBuilder(
            "user_id",
            "=",
            expressionBuilder.fn<string>("public.current_app_user_id")
          )
        )
        .where("status", "=", TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending)
        .returning("id")
        .executeTakeFirst();

      if (!updatedSubscription) {
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
      await this.restorePaymentBlockedMembership(database, input.tribeId);

      const recoveredSubscription = await database.kysely
        .insertInto("tribe_member_subscriptions")
        .values((expressionBuilder) => ({
          created_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          current_period_end: null,
          mercado_pago_preapproval_id: input.providerSubscriptionId,
          price_id: input.priceId,
          status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
          status_reason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
          tribe_id: input.tribeId,
          updated_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          user_id: expressionBuilder.fn<string>("public.current_app_user_id"),
        }))
        .onConflict((conflictBuilder) => conflictBuilder.doNothing())
        .returning("id")
        .executeTakeFirst();

      if (!recoveredSubscription) {
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
      if (input.requiresActiveInvitation) {
        await this.setCurrentInvitationContext(
          database.kysely,
          input.invitationTokenHash
        );
      }

      const targetTribe = await this.findTargetTribe(
        database.kysely,
        input.tribeSlug
      );

      await this.setSubscriptionCheckoutContext(
        database.kysely,
        targetTribe?.id ?? "",
        input.invitationTokenHash
      );

      if (!targetTribe) {
        return null;
      }

      const [
        activeInvitation,
        currentPrice,
        existingMembership,
        retryBlockingSubscription,
        existingPendingCheckout,
        currentUser,
        paymentIntegration,
      ] = await Promise.all([
        database.kysely
          .selectFrom("tribe_invitations")
          .select("id")
          .where("tribe_id", "=", targetTribe.id)
          .where("token_hash", "=", input.invitationTokenHash)
          .where("status", "=", "active")
          .limit(1)
          .executeTakeFirst(),
        database.kysely
          .selectFrom("tribe_subscription_prices")
          .select([
            "id",
            "amount_cents",
            "currency",
            "name",
            "mercado_pago_preapproval_plan_id",
          ])
          .where("tribe_id", "=", targetTribe.id)
          .where("is_current", "=", true)
          .where("status", "=", TRIBE_SUBSCRIPTION_PRICE_STATUS.active)
          .limit(1)
          .executeTakeFirst(),
        database.kysely
          .selectFrom("tribe_members")
          .select(["status", "status_reason"])
          .where("tribe_id", "=", targetTribe.id)
          .where((expressionBuilder) =>
            expressionBuilder(
              "user_id",
              "=",
              expressionBuilder.fn<string>("public.current_app_user_id")
            )
          )
          .limit(1)
          .executeTakeFirst(),
        database.kysely
          .selectFrom("tribe_member_subscriptions")
          .select("id")
          .where("tribe_id", "=", targetTribe.id)
          .where((expressionBuilder) =>
            expressionBuilder(
              "user_id",
              "=",
              expressionBuilder.fn<string>("public.current_app_user_id")
            )
          )
          .where("status", "in", CURRENT_MEMBER_SUBSCRIPTION_STATUS_VALUES)
          .limit(1)
          .executeTakeFirst(),
        this.findExistingPendingCheckout(database.kysely, targetTribe.id),
        database.kysely
          .selectNoFrom((expressionBuilder) => [
            expressionBuilder.fn<string>("public.current_app_user_email").as(
              "current_user_email"
            ),
          ])
          .executeTakeFirst(),
        this.findMercadoPagoIntegration(database.kysely, targetTribe.id),
      ]);

      return {
        access_token: paymentIntegration?.access_token ?? null,
        current_price_amount_cents: currentPrice?.amount_cents ?? null,
        current_price_currency: currentPrice?.currency ?? null,
        current_price_id: currentPrice?.id ?? null,
        current_price_name: currentPrice?.name ?? null,
        current_price_provider_plan_id:
          currentPrice?.mercado_pago_preapproval_plan_id ?? null,
        current_user_email: currentUser?.current_user_email ?? null,
        existing_checkout_subscription_id:
          existingPendingCheckout?.subscription_id ?? null,
        existing_checkout_url: existingPendingCheckout?.checkout_url ?? null,
        existing_membership_status: existingMembership?.status ?? null,
        existing_membership_status_reason:
          existingMembership?.status_reason ?? null,
        existing_provider_subscription_id:
          existingPendingCheckout?.provider_subscription_id ?? null,
        has_active_invitation: Boolean(activeInvitation),
        has_retry_blocking_member_subscription: Boolean(
          retryBlockingSubscription
        ),
        refresh_token: paymentIntegration?.refresh_token ?? null,
        token_expires_at: paymentIntegration?.token_expires_at ?? null,
        tribe_id: targetTribe.id,
      };
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

    const tribeId = input.tribeId;

    return this.executeWithDatabase(async (database) => {
      await this.setCurrentInvitationContext(
        database.kysely,
        input.invitationTokenHash
      );
      await this.restorePaymentBlockedMembership(database, tribeId);

      const reservedSubscription = await database.kysely
        .insertInto("tribe_member_subscriptions")
        .values((expressionBuilder) => ({
          created_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          current_period_end: null,
          mercado_pago_preapproval_id: null,
          price_id: input.currentPriceId,
          status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
          status_reason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
          tribe_id: tribeId,
          updated_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          user_id: expressionBuilder.fn<string>("public.current_app_user_id"),
        }))
        .onConflict((conflictBuilder) => conflictBuilder.doNothing())
        .returning("id")
        .executeTakeFirst();
      const claimedReservation = reservedSubscription
        ? null
        : await this.claimRecoverableReservation(database.kysely, tribeId);
      const reservedSubscriptionId =
        reservedSubscription?.id ?? claimedReservation?.id ?? null;
      const pendingCheckout = reservedSubscriptionId
        ? await this.findLatestPendingCheckoutUrl(database.kysely, tribeId)
        : null;

      return {
        checkout_url: pendingCheckout?.checkout_url ?? null,
        reserved_subscription_id: reservedSubscriptionId,
      };
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
      await this.restorePaymentBlockedMembership(database, input.tribeId);

      await database.kysely
        .insertInto("subscription_idempotency_operations")
        .values((expressionBuilder) => ({
          created_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          operation_key: input.operationKey,
          operation_type: "start_member_subscription",
          payload_hash: hashPayload({ tribeSlug: input.tribeSlug }),
          response_body: { checkoutUrl: input.checkoutUrl },
          tribe_id: input.tribeId,
          user_id: expressionBuilder.fn<string>("public.current_app_user_id"),
        }))
        .onConflict((conflictBuilder) =>
          conflictBuilder
            .column("operation_key")
            .doUpdateSet((expressionBuilder) => ({
              created_at: expressionBuilder.ref("excluded.created_at"),
              payload_hash: expressionBuilder.ref("excluded.payload_hash"),
              response_body: expressionBuilder.ref("excluded.response_body"),
            }))
            .whereRef(
              "subscription_idempotency_operations.operation_type",
              "=",
              "excluded.operation_type"
            )
            .whereRef(
              "subscription_idempotency_operations.tribe_id",
              "=",
              "excluded.tribe_id"
            )
            .whereRef(
              "subscription_idempotency_operations.user_id",
              "=",
              "excluded.user_id"
            )
        )
        .execute();

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
      const [subscriptionContext, existingOperation] = await Promise.all([
        database.kysely
          .selectFrom("tribe_member_subscriptions")
          .innerJoin(
            "tribe_payment_integrations",
            "tribe_payment_integrations.tribe_id",
            "tribe_member_subscriptions.tribe_id"
          )
          .select([
            "tribe_payment_integrations.access_token",
            "tribe_payment_integrations.refresh_token",
            "tribe_payment_integrations.token_expires_at",
            "tribe_member_subscriptions.price_id",
            "tribe_member_subscriptions.tribe_id",
          ])
          .where(
            "tribe_member_subscriptions.mercado_pago_preapproval_id",
            "=",
            command.resourceId
          )
          .where(
            "tribe_payment_integrations.provider",
            "=",
            "mercado_pago"
          )
          .limit(1)
          .executeTakeFirst(),
        database.kysely
          .selectFrom("subscription_idempotency_operations")
          .select("id")
          .where("operation_key", "=", operationKey)
          .limit(1)
          .executeTakeFirst(),
      ]);
      const context: WebhookSubscriptionContextRow | null = subscriptionContext
        ? {
            ...subscriptionContext,
            existing_operation_id: existingOperation?.id ?? null,
            subscription_found: true,
          }
        : null;

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

      const operation = await database.kysely
        .insertInto("subscription_idempotency_operations")
        .values((expressionBuilder) => ({
          created_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          operation_key: operationKey,
          operation_type: "mercado_pago_webhook",
          payload_hash: payloadHash,
          response_body: {},
          tribe_id: null,
          user_id: null,
        }))
        .onConflict((conflictBuilder) => conflictBuilder.doNothing())
        .returning("id as operation_inserted")
        .executeTakeFirst();

      if (!operation?.operation_inserted) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook };
      }

      await database.kysely
        .updateTable("tribe_member_subscriptions")
        .set((expressionBuilder) => ({
          status: subscriptionStatus.status,
          status_reason: subscriptionStatus.statusReason,
          updated_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
        }))
        .where("mercado_pago_preapproval_id", "=", command.resourceId)
        .execute();

      await this.updateMembershipAccessForProviderSubscription(
        database,
        command.resourceId
      );

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed };
    });
  }

  private async findTargetTribe(
    database: RequestDatabase["kysely"],
    tribeSlug: string
  ): Promise<{ id: string } | null> {
    return (
      (await database
        .selectFrom("tribes")
        .select("id")
        .where("slug", "=", tribeSlug)
        .limit(1)
        .executeTakeFirst()) ?? null
    );
  }

  private async findMercadoPagoIntegration(
    database: RequestDatabase["kysely"],
    tribeId: string
  ) {
    return database
      .selectFrom("tribe_payment_integrations")
      .select(["access_token", "refresh_token", "token_expires_at"])
      .where("tribe_id", "=", tribeId)
      .where("provider", "=", "mercado_pago")
      .limit(1)
      .executeTakeFirst();
  }

  private async setSubscriptionCheckoutContext(
    database: RequestDatabase["kysely"],
    tribeId: string,
    invitationTokenHash: string
  ): Promise<void> {
    await database
      .selectNoFrom((expressionBuilder) => [
        expressionBuilder.fn<string>("set_config", [
          expressionBuilder.val(SUBSCRIPTION_CHECKOUT_CONTEXT.settingName),
          expressionBuilder.val(tribeId),
          expressionBuilder.val(true),
        ]).as("subscription_checkout_context"),
        expressionBuilder.fn<string>("set_config", [
          expressionBuilder.val(
            SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName
          ),
          expressionBuilder.val(invitationTokenHash),
          expressionBuilder.val(true),
        ]).as("subscription_invitation_context"),
      ])
      .executeTakeFirst();
  }

  private async setCurrentInvitationContext(
    database: RequestDatabase["kysely"],
    invitationTokenHash: string
  ): Promise<void> {
    await database
      .selectNoFrom((expressionBuilder) => [
        expressionBuilder.fn<string>("set_config", [
          expressionBuilder.val(
            SUBSCRIPTION_CHECKOUT_CONTEXT.invitationSettingName
          ),
          expressionBuilder.val(invitationTokenHash),
          expressionBuilder.val(true),
        ]).as("subscription_invitation_context"),
      ])
      .executeTakeFirst();
  }

  private async findSinglePendingPlanCheckoutReturnTribe(
    database: RequestDatabase["kysely"]
  ): Promise<ProviderSubscriptionReturnPathRow | null> {
    const pendingPlanCheckouts = await database
      .selectFrom("tribe_member_subscriptions")
      .innerJoin("tribes", "tribes.id", "tribe_member_subscriptions.tribe_id")
      .select("tribes.slug as tribe_slug")
      .where((expressionBuilder) =>
        expressionBuilder(
          "tribe_member_subscriptions.user_id",
          "=",
          expressionBuilder.fn<string>("public.current_app_user_id")
        )
      )
      .where(
        "tribe_member_subscriptions.status",
        "=",
        TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending
      )
      .where("tribe_member_subscriptions.mercado_pago_preapproval_id", "is", null)
      .orderBy("tribe_member_subscriptions.updated_at", "desc")
      .execute();

    return pendingPlanCheckouts.length === 1
      ? { tribe_slug: pendingPlanCheckouts[0].tribe_slug }
      : null;
  }

  private async findExistingPendingCheckout(
    database: RequestDatabase["kysely"],
    tribeId: string
  ): Promise<{
    checkout_url: string | null;
    provider_subscription_id: string | null;
    subscription_id: string | null;
  } | null> {
    const pendingSubscription = await database
      .selectFrom("tribe_member_subscriptions")
      .select(["id", "mercado_pago_preapproval_id"])
      .where("tribe_id", "=", tribeId)
      .where((expressionBuilder) =>
        expressionBuilder(
          "user_id",
          "=",
          expressionBuilder.fn<string>("public.current_app_user_id")
        )
      )
      .where("status", "=", TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending)
      .orderBy("updated_at", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!pendingSubscription) {
      return null;
    }

    const pendingCheckout = await this.findLatestPendingCheckoutUrl(
      database,
      tribeId
    );

    return {
      checkout_url: pendingCheckout?.checkout_url ?? null,
      provider_subscription_id:
        pendingSubscription.mercado_pago_preapproval_id ?? null,
      subscription_id: pendingSubscription.id,
    };
  }

  private async findLatestPendingCheckoutUrl(
    database: RequestDatabase["kysely"],
    tribeId: string
  ): Promise<{ checkout_url: string | null } | null> {
    const operations = await database
      .selectFrom("subscription_idempotency_operations")
      .select("response_body")
      .where("tribe_id", "=", tribeId)
      .where((expressionBuilder) =>
        expressionBuilder(
          "user_id",
          "=",
          expressionBuilder.fn<string>("public.current_app_user_id")
        )
      )
      .where("operation_type", "=", "start_member_subscription")
      .orderBy("created_at", "desc")
      .execute();
    const checkoutUrl =
      operations
        .map((operation) => this.readCheckoutUrl(operation.response_body))
        .find((operationCheckoutUrl): operationCheckoutUrl is string =>
          Boolean(operationCheckoutUrl)
        ) ?? null;

    return checkoutUrl ? { checkout_url: checkoutUrl } : null;
  }

  private readCheckoutUrl(responseBody: unknown): string | null {
    if (
      responseBody &&
      typeof responseBody === "object" &&
      "checkoutUrl" in responseBody &&
      typeof responseBody.checkoutUrl === "string"
    ) {
      return responseBody.checkoutUrl;
    }

    return null;
  }

  private async restorePaymentBlockedMembership(
    database: RequestDatabase,
    tribeId: string | null
  ): Promise<void> {
    if (!tribeId) {
      return;
    }

    await database.kysely
      .insertInto("tribe_members")
      .values((expressionBuilder) => ({
        created_at: expressionBuilder.fn<Date>("timezone", [
          expressionBuilder.val("utc"),
          expressionBuilder.fn<Date>("now"),
        ]),
        role: "tribemate",
        status: "blocked",
        status_reason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
        tribe_id: tribeId,
        user_id: expressionBuilder.fn<string>("public.current_app_user_id"),
      }))
      .onConflict((conflictBuilder) => conflictBuilder.doNothing())
      .execute();

    await database.kysely
      .updateTable("tribe_members")
      .set({
        status: "blocked",
        status_reason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
      })
      .where("tribe_id", "=", tribeId)
      .where((expressionBuilder) =>
        expressionBuilder(
          "user_id",
          "=",
          expressionBuilder.fn<string>("public.current_app_user_id")
        )
      )
      .where("status", "=", "removed")
      .where(
        "status_reason",
        "=",
        TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive
      )
      .execute();
  }

  private async claimRecoverableReservation(
    database: RequestDatabase["kysely"],
    tribeId: string
  ): Promise<{ id: string } | null> {
    const staleReservationCutoff = new Date(
      Date.now() - SUBSCRIPTION_RESERVATION.staleReservationWindowMilliseconds
    );
    const recoverableReservation = await database
      .selectFrom("tribe_member_subscriptions")
      .select("id")
      .where("tribe_id", "=", tribeId)
      .where((expressionBuilder) =>
        expressionBuilder(
          "user_id",
          "=",
          expressionBuilder.fn<string>("public.current_app_user_id")
        )
      )
      .where("status", "=", TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending)
      .where("mercado_pago_preapproval_id", "is", null)
      .where("updated_at", "<", staleReservationCutoff)
      .limit(1)
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();

    return recoverableReservation
      ? await database
          .updateTable("tribe_member_subscriptions")
          .set((expressionBuilder) => ({
            updated_at: expressionBuilder.fn<Date>("timezone", [
              expressionBuilder.val("utc"),
              expressionBuilder.fn<Date>("now"),
            ]),
          }))
          .where("id", "=", recoverableReservation.id)
          .returning("id")
          .executeTakeFirst() ?? null
      : null;
  }

  private async updateMembershipAccessForProviderSubscription(
    database: RequestDatabase,
    providerSubscriptionId: string
  ): Promise<void> {
    const targetSubscriptions = await database.kysely
      .selectFrom("tribe_member_subscriptions")
      .select(["tribe_id", "user_id"])
      .where("mercado_pago_preapproval_id", "=", providerSubscriptionId)
      .execute();

    for (const targetSubscription of targetSubscriptions) {
      await this.refreshMembershipAccess(database, targetSubscription);
    }
  }

  private async refreshMembershipAccess(
    database: RequestDatabase,
    targetSubscription: {
      tribe_id: string;
      user_id: string;
    }
  ): Promise<void> {
    const [activeSubscription, pendingSubscription] = await Promise.all([
      database.kysely
        .selectFrom("tribe_member_subscriptions")
        .select("id")
        .where("tribe_id", "=", targetSubscription.tribe_id)
        .where("user_id", "=", targetSubscription.user_id)
        .where("status", "=", TRIBE_MEMBER_SUBSCRIPTION_STATUS.active)
        .limit(1)
        .executeTakeFirst(),
      database.kysely
        .selectFrom("tribe_member_subscriptions")
        .select("id")
        .where("tribe_id", "=", targetSubscription.tribe_id)
        .where("user_id", "=", targetSubscription.user_id)
        .where("status", "=", TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending)
        .limit(1)
        .executeTakeFirst(),
    ]);
    const status = activeSubscription
      ? "active"
      : pendingSubscription
        ? "blocked"
        : "removed";
    const statusReason = activeSubscription
      ? TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none
      : pendingSubscription
        ? TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked
        : TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive;

    await database.kysely
      .updateTable("tribe_members")
      .set({
        status,
        status_reason: statusReason,
      })
      .where("tribe_id", "=", targetSubscription.tribe_id)
      .where("user_id", "=", targetSubscription.user_id)
      .where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("status", "<>", "blocked"),
          expressionBuilder(
            "status_reason",
            "=",
            TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked
          ),
        ])
      )
      .execute();
  }
}
