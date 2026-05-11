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
  StartCurrentPriceSubscriptionCommand,
  TribeMemberSubscriptionStatusQuery,
  TribeMemberSubscriptionRepository,
} from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {
  MercadoPagoPreapprovalStatusInput,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import {
  resolveMercadoPagoAccessToken,
  type MercadoPagoAccessTokenRefresher,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MercadoPagoPreapprovalStatusGetter = (
  input: MercadoPagoPreapprovalStatusInput
) => Promise<string | null>;

type MercadoPagoPlanCheckoutUrlBuilder = (preapprovalPlanId: string) => string;

type MercadoPagoPreapprovalStatusUpdater = (input: {
  accessToken: string;
  preapprovalId: string;
  status: "canceled";
}) => Promise<string>;

type SubscriptionStartContextRow = {
  access_token: string | null;
  current_price_amount_cents: number | null;
  current_price_currency: string | null;
  current_price_id: string | null;
  current_price_name: string | null;
  current_price_provider_plan_id: string | null;
  current_user_email: string | null;
  existing_checkout_url: string | null;
  existing_membership_status: string | null;
  existing_membership_status_reason: string | null;
  has_active_invitation: boolean | null;
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
  refresh_token: string | null;
  subscription_found: boolean | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type WebhookOperationInsertRow = {
  operation_inserted: string | null;
};

type PendingSubscriptionReturnRow = {
  has_pending_subscription_return: boolean | null;
};

type SubscriptionReconciliationContextRow = {
  access_token: string | null;
  mercado_pago_preapproval_id: string | null;
  refresh_token: string | null;
  subscription_found: boolean | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PendingSubscriptionReturnAttachmentContextRow = {
  access_token: string | null;
  refresh_token: string | null;
  reserved_subscription_id: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

const SUBSCRIPTION_CHECKOUT_CONTEXT = {
  invitationSettingName: "app.current_invitation_hash",
  settingName: "app.subscription_checkout_tribe_id",
} as const;

/**
 * Defines when an unfinished local checkout reservation can be retried.
 */
const SUBSCRIPTION_RESERVATION = {
  staleReservationInterval: "5 minutes",
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

const MERCADO_PAGO_PREAPPROVAL_STATUS = {
  authorized: "authorized",
  canceled: "canceled",
  cancelled: "cancelled",
  paused: "paused",
  pending: "pending",
} as const;

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
 * Maps Mercado Pago preapproval statuses into the local subscription lifecycle.
 *
 * @param providerStatus - Status returned by Mercado Pago for a preapproval.
 * @returns Local subscription status and status reason.
 */
function mapProviderSubscriptionStatus(providerStatus: string | null) {
  switch (providerStatus) {
    case MERCADO_PAGO_PREAPPROVAL_STATUS.authorized:
      return {
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.active,
        statusReason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none,
      };
    case MERCADO_PAGO_PREAPPROVAL_STATUS.canceled:
    case MERCADO_PAGO_PREAPPROVAL_STATUS.cancelled:
    case null:
      return {
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
        statusReason:
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive,
      };
    case MERCADO_PAGO_PREAPPROVAL_STATUS.paused:
      return {
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused,
        statusReason:
          TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive,
      };
    case MERCADO_PAGO_PREAPPROVAL_STATUS.pending:
    default:
      return {
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
        statusReason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
      };
  }
}

export class PostgresTribeMemberSubscriptionRepository
  implements TribeMemberSubscriptionRepository
{
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly buildMercadoPagoPlanCheckoutUrl: MercadoPagoPlanCheckoutUrlBuilder,
    private readonly getMercadoPagoPreapprovalStatus: MercadoPagoPreapprovalStatusGetter,
    private readonly updateMercadoPagoPreapprovalStatus: MercadoPagoPreapprovalStatusUpdater,
    private readonly refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher
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
   * Confirms a provider return and applies access changes immediately.
   *
   * @param query - Tribe slug and Mercado Pago preapproval id from the return URL.
   * @returns Local status after provider reconciliation.
   */
  async confirmSubscriptionReturn(
    query: PendingSubscriptionReturnQuery
  ): Promise<TribeMemberSubscriptionStatusResult> {
    const existingSubscription = await this.reconcileSubscriptionByProviderId({
      providerSubscriptionId: query.providerSubscriptionId,
      tribeSlug: query.tribeSlug,
    });

    if (existingSubscription.status !== TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound) {
      return existingSubscription;
    }

    return this.attachPendingPlanCheckoutReturn(query);
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

    try {
      confirmedProviderStatus = await this.updateMercadoPagoPreapprovalStatus({
        accessToken,
        preapprovalId: context.mercado_pago_preapproval_id,
        status: MERCADO_PAGO_PREAPPROVAL_STATUS.canceled,
      });
    } catch {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    if (
      confirmedProviderStatus !== MERCADO_PAGO_PREAPPROVAL_STATUS.canceled &&
      confirmedProviderStatus !== MERCADO_PAGO_PREAPPROVAL_STATUS.cancelled
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

    try {
      providerStatus = await this.getMercadoPagoPreapprovalStatus({
        accessToken,
        preapprovalId: context.mercado_pago_preapproval_id,
      });
    } catch {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    const subscriptionStatus = mapProviderSubscriptionStatus(providerStatus);

    await this.persistProviderSubscriptionStatus({
      providerSubscriptionId: context.mercado_pago_preapproval_id,
      providerStatus,
    });

    return {
      status:
        subscriptionStatus.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused
          ? TRIBE_MEMBER_SUBSCRIPTION_STATUS.removedBySubscription
          : subscriptionStatus.status,
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

    try {
      providerStatus = await this.getMercadoPagoPreapprovalStatus({
        accessToken,
        preapprovalId: query.providerSubscriptionId,
      });
    } catch {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable };
    }

    if (!providerStatus) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    const subscriptionStatus = mapProviderSubscriptionStatus(providerStatus);

    const wasProviderSubscriptionAttached =
      await this.attachProviderSubscriptionToPendingPlanCheckout({
        providerStatus,
        providerSubscriptionId: query.providerSubscriptionId,
        subscriptionId: context.reserved_subscription_id,
      });

    if (!wasProviderSubscriptionAttached) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound };
    }

    return {
      status:
        subscriptionStatus.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused
          ? TRIBE_MEMBER_SUBSCRIPTION_STATUS.removedBySubscription
          : subscriptionStatus.status,
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
          select tribe_member_subscriptions.id
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
            and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
            and tribe_member_subscriptions.mercado_pago_preapproval_id is null
          order by tribe_member_subscriptions.updated_at desc
          limit 1
        )
        select
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
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

  private async persistProviderSubscriptionStatus(input: {
    providerSubscriptionId: string;
    providerStatus: string | null;
  }): Promise<void> {
    const subscriptionStatus = mapProviderSubscriptionStatus(input.providerStatus);

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
    providerStatus: string;
    providerSubscriptionId: string;
    subscriptionId: string;
  }): Promise<boolean> {
    const subscriptionStatus = mapProviderSubscriptionStatus(input.providerStatus);

    return this.executeWithDatabase(async (database) => {
      const updatedSubscriptionResult = await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          mercado_pago_preapproval_id = ${input.providerSubscriptionId},
          status = ${subscriptionStatus.status},
          status_reason = ${subscriptionStatus.statusReason},
          updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${input.subscriptionId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is null
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

  /**
   * Starts or resumes a current-price subscription for the current user.
   *
   * @param command - Tribe slug and idempotency key.
   * @returns Checkout URL or a stable rejection status.
   */
  async startCurrentPriceSubscription(
    command: StartCurrentPriceSubscriptionCommand
  ): Promise<TribeMemberSubscriptionStartResult> {
    const operationKey = `member-subscription:${command.tribeSlug}:${command.idempotencyKey}`;
    const invitationTokenHash = hashInvitationToken(command.invitationToken);

    const context = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
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
              ${invitationTokenHash},
              true
            )
        ),
        active_invitation as (
          select tribe_invitations.id
          from public.tribe_invitations
          cross join checkout_context
          inner join target_tribe
            on target_tribe.id = tribe_invitations.tribe_id
          where tribe_invitations.token_hash = ${invitationTokenHash}
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
        existing_pending_checkout as (
          select subscription_idempotency_operations.response_body->>'checkoutUrl' as checkout_url
          from public.subscription_idempotency_operations
          inner join target_tribe
            on target_tribe.id = subscription_idempotency_operations.tribe_id
          where subscription_idempotency_operations.user_id = public.current_app_user_id()
            and subscription_idempotency_operations.operation_type = 'start_member_subscription'
            and subscription_idempotency_operations.response_body ? 'checkoutUrl'
            and exists (
              select 1
              from public.tribe_member_subscriptions
              where tribe_member_subscriptions.tribe_id = target_tribe.id
                and tribe_member_subscriptions.user_id = public.current_app_user_id()
                and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
            )
          order by subscription_idempotency_operations.created_at desc
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
          (select checkout_url from existing_pending_checkout) as existing_checkout_url,
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

    if (!context?.has_active_invitation) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.invalidInvitation };
    }

    if (
      !context?.current_price_id ||
      !context.current_price_provider_plan_id
    ) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice };
    }

    if (
      context.existing_membership_status === "blocked" &&
      context.existing_membership_status_reason !==
        TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked
    ) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked };
    }

    if (context.existing_checkout_url) {
      return {
        checkoutUrl: context.existing_checkout_url,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      };
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
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked };
    }

    const reservation = await this.reservePendingSubscription({
      currentPriceId: context.current_price_id,
      invitationTokenHash,
      tribeId: context.tribe_id,
    });

    if (reservation.checkout_url) {
      return {
        checkoutUrl: reservation.checkout_url,
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      };
    }

    if (!reservation.reserved_subscription_id) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked };
    }

    const checkoutUrl = this.buildMercadoPagoPlanCheckoutUrl(
      context.current_price_provider_plan_id
    );

    return this.persistReservedCheckout({
      checkoutUrl,
      operationKey,
      subscriptionId: reservation.reserved_subscription_id,
      tribeId: context.tribe_id,
      tribeSlug: command.tribeSlug,
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
   * Persists the provider checkout idempotently after Mercado Pago accepts it.
   *
   * @param input - Provider checkout data and local subscription identity.
   * @returns Start result containing the checkout URL when persistence succeeds.
   */
  private async persistReservedCheckout(input: {
    checkoutUrl: string;
    operationKey: string;
    subscriptionId: string;
    tribeId: string | null;
    tribeSlug: string;
  }): Promise<TribeMemberSubscriptionStartResult> {
    return this.executeWithDatabase(async (database) => {
      const updatedSubscriptionResult = await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${input.subscriptionId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is null
        returning id
      `);

      if ((updatedSubscriptionResult.rows ?? []).length === 0) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked };
      }

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
        on conflict (operation_key) do nothing
      `);

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

      const providerStatus = await this.getMercadoPagoPreapprovalStatus({
        accessToken,
        preapprovalId: command.resourceId,
      });
      const subscriptionStatus = mapProviderSubscriptionStatus(providerStatus);

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
