/**
 * Persists member subscriptions and webhook idempotency in Postgres.
 *
 * @module postgres-tribe-member-subscription-repository
 */

import { createHash } from "crypto";

import { sql } from "drizzle-orm";

import type {
  TribeMemberSubscriptionStartResult,
  TribeMemberSubscriptionWebhookResult,
} from "@/src/modules/subscriptions/application/results/tribe-member-subscription-result";
import {
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  MercadoPagoSubscriptionWebhookCommand,
  StartCurrentPriceSubscriptionCommand,
  TribeMemberSubscriptionRepository,
} from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {
  MercadoPagoPreapprovalStatusInput,
  MercadoPagoSubscriptionInput,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MercadoPagoSubscriptionCreator = (
  input: MercadoPagoSubscriptionInput
) => Promise<{
  checkoutUrl: string;
  providerSubscriptionId: string;
}>;

type MercadoPagoPreapprovalStatusGetter = (
  input: MercadoPagoPreapprovalStatusInput
) => Promise<string>;

type SubscriptionStartContextRow = {
  access_token: string | null;
  current_price_id: string | null;
  current_price_name: string | null;
  current_user_email: string | null;
  existing_checkout_url: string | null;
  existing_membership_status: string | null;
  existing_status_reason: string | null;
  has_active_invitation: boolean | null;
  mercado_pago_preapproval_plan_id: string | null;
  tribe_id: string | null;
};

type SubscriptionReservationRow = {
  checkout_url: string | null;
  reserved_subscription_id: string | null;
};

type WebhookSubscriptionContextRow = {
  access_token: string | null;
  operation_inserted: string | null;
  subscription_found: boolean | null;
};

const SUBSCRIPTION_CHECKOUT_CONTEXT = {
  invitationSettingName: "app.current_invitation_hash",
  settingName: "app.subscription_checkout_tribe_id",
} as const;

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
 * Builds the callback URL used after Mercado Pago checkout.
 *
 * @param baseUrl - Public app base URL.
 * @param tribeSlug - Tribe slug for the destination page.
 * @returns Absolute callback URL.
 */
function buildSubscriptionBackUrl(baseUrl: string, tribeSlug: string): string {
  return `${baseUrl}/tribu/${tribeSlug}`;
}

/**
 * Maps Mercado Pago preapproval statuses into the local subscription lifecycle.
 *
 * @param providerStatus - Status returned by Mercado Pago for a preapproval.
 * @returns Local subscription status and status reason.
 */
function mapProviderSubscriptionStatus(providerStatus: string) {
  switch (providerStatus) {
    case MERCADO_PAGO_PREAPPROVAL_STATUS.authorized:
      return {
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.active,
        statusReason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none,
      };
    case MERCADO_PAGO_PREAPPROVAL_STATUS.canceled:
    case MERCADO_PAGO_PREAPPROVAL_STATUS.cancelled:
      return {
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
        statusReason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
      };
    case MERCADO_PAGO_PREAPPROVAL_STATUS.paused:
      return {
        status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.gracePeriod,
        statusReason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
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
    private readonly createMercadoPagoSubscription: MercadoPagoSubscriptionCreator,
    private readonly getMercadoPagoPreapprovalStatus: MercadoPagoPreapprovalStatusGetter,
    private readonly resolvePublicAppBaseUrl: () => string
  ) {}

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
          select tribe_members.status
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = public.current_app_user_id()
          limit 1
        ),
        existing_subscription as (
          select tribe_member_subscriptions.status_reason
          from public.tribe_member_subscriptions
          inner join target_tribe
            on target_tribe.id = tribe_member_subscriptions.tribe_id
          where tribe_member_subscriptions.user_id = public.current_app_user_id()
          order by tribe_member_subscriptions.created_at desc
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
          (select name from current_price) as current_price_name,
          (select mercado_pago_preapproval_plan_id from current_price) as mercado_pago_preapproval_plan_id,
          exists (select 1 from active_invitation) as has_active_invitation,
          (select status from existing_membership) as existing_membership_status,
          (select status_reason from existing_subscription) as existing_status_reason,
          (select checkout_url from existing_pending_checkout) as existing_checkout_url,
          public.current_app_user_email() as current_user_email,
          tribe_payment_integrations.access_token
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

    if (!context?.current_price_id || !context.mercado_pago_preapproval_plan_id) {
      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice };
    }

    if (
      context.existing_membership_status === "blocked" &&
      context.existing_status_reason !==
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

    if (!context.access_token || !context.current_user_email) {
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

    let providerSubscription: {
      checkoutUrl: string;
      providerSubscriptionId: string;
    };

    try {
      providerSubscription = await this.createMercadoPagoSubscription({
        accessToken: context.access_token,
        backUrl: buildSubscriptionBackUrl(
          this.resolvePublicAppBaseUrl(),
          command.tribeSlug
        ),
        idempotencyKey: command.idempotencyKey,
        payerEmail: context.current_user_email,
        preapprovalPlanId: context.mercado_pago_preapproval_plan_id,
        reason: context.current_price_name ?? "Tribe subscription",
      });
    } catch {
      await this.releasePendingSubscriptionReservation(
        reservation.reserved_subscription_id
      );

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked };
    }

    return this.persistReservedCheckout({
      checkoutUrl: providerSubscription.checkoutUrl,
      operationKey,
      providerSubscriptionId: providerSubscription.providerSubscriptionId,
      subscriptionId: reservation.reserved_subscription_id,
      tribeId: context.tribe_id,
      tribeSlug: command.tribeSlug,
    });
  }

  private async releasePendingSubscriptionReservation(
    subscriptionId: string
  ): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled},
          status_reason = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked},
          updated_at = timezone('utc', now())
        where tribe_member_subscriptions.id = ${subscriptionId}
          and tribe_member_subscriptions.user_id = public.current_app_user_id()
          and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          and tribe_member_subscriptions.mercado_pago_preapproval_id is null
      `);
    });
  }

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
            created_at
          )
          select
            ${input.tribeId},
            public.current_app_user_id(),
            'tribemate',
            'blocked',
            timezone('utc', now())
          from checkout_context
          on conflict (tribe_id, user_id) do nothing
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
          (select id from reserved_subscription) as reserved_subscription_id,
          (select checkout_url from existing_pending_checkout) as checkout_url
      `);

      return (result.rows?.[0] ?? {
        checkout_url: null,
        reserved_subscription_id: null,
      }) as SubscriptionReservationRow;
    });
  }

  private async persistReservedCheckout(input: {
    checkoutUrl: string;
    operationKey: string;
    providerSubscriptionId: string;
    subscriptionId: string;
    tribeId: string | null;
    tribeSlug: string;
  }): Promise<TribeMemberSubscriptionStartResult> {
    return this.executeWithDatabase(async (database) => {
      const updatedSubscriptionResult = await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          mercado_pago_preapproval_id = ${input.providerSubscriptionId},
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
          created_at
        )
        values (
          ${input.tribeId},
          public.current_app_user_id(),
          'tribemate',
          'blocked',
          timezone('utc', now())
        )
        on conflict (tribe_id, user_id) do nothing
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
            true as subscription_found
          from public.tribe_member_subscriptions
          inner join public.tribe_payment_integrations
            on tribe_payment_integrations.tribe_id = tribe_member_subscriptions.tribe_id
            and tribe_payment_integrations.provider = 'mercado_pago'
          where tribe_member_subscriptions.mercado_pago_preapproval_id = ${command.resourceId}
          limit 1
        ),
        inserted_operation as (
          insert into public.subscription_idempotency_operations (
            operation_key,
            operation_type,
            payload_hash,
            response_body,
            created_at
          )
          select
            ${operationKey},
            'mercado_pago_webhook',
            ${payloadHash},
            '{}'::jsonb,
            timezone('utc', now())
          where exists (select 1 from subscription_context)
          on conflict (operation_key) do nothing
          returning id
        )
        select
          (select id from inserted_operation) as operation_inserted,
          (select access_token from subscription_context) as access_token,
          coalesce((select subscription_found from subscription_context), false) as subscription_found
      `);
      const context = (result.rows?.[0] ?? null) as
        | WebhookSubscriptionContextRow
        | null;

      if (!context?.subscription_found) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.retryableWebhook };
      }

      if (!context.operation_inserted) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook };
      }

      if (!context.access_token) {
        return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed };
      }

      const providerStatus = await this.getMercadoPagoPreapprovalStatus({
        accessToken: context.access_token,
        preapprovalId: command.resourceId,
      });
      const subscriptionStatus = mapProviderSubscriptionStatus(providerStatus);

      await database.execute(sql`
        update public.tribe_member_subscriptions
        set
          status = ${subscriptionStatus.status},
          status_reason = ${subscriptionStatus.statusReason},
          updated_at = timezone('utc', now())
        where mercado_pago_preapproval_id = ${command.resourceId}
      `);

      await database.execute(sql`
        update public.tribe_members
        set status = case
          when exists (
            select 1
            from public.tribe_member_subscriptions
            where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
              and tribe_member_subscriptions.user_id = tribe_members.user_id
              and tribe_member_subscriptions.status in (
                ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active},
                ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.gracePeriod}
              )
          ) then 'active'
          else 'blocked'
        end
        where exists (
          select 1
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
            and tribe_member_subscriptions.user_id = tribe_members.user_id
            and tribe_member_subscriptions.mercado_pago_preapproval_id = ${command.resourceId}
        )
      `);

      return { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed };
    });
  }
}
