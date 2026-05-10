/**
 * Persists and maps tribe subscription price versions in Postgres.
 *
 * @module postgres-tribe-subscription-price-repository
 */

import { sql } from "drizzle-orm";

import type {
  TribeSubscriptionProviderPlanVerificationResult,
  TribeSubscriptionProviderPlansVerificationResult,
  TribeSubscriptionProviderPlanSyncResult,
  TribeSubscriptionProviderSubscribersVerificationResult,
  TribeSubscriptionPriceListResult,
  TribeSubscriptionPriceMutationResult,
  TribeSubscriptionPriceResult,
} from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";
import {
  TRIBE_SUBSCRIPTION_PRICE_LIMIT,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  CreateTribeSubscriptionPriceCommand,
  SyncTribeSubscriptionProviderPlanCommand,
  TribeSubscriptionPriceIdentity,
  TribeSubscriptionPriceListQuery,
  TribeSubscriptionPriceRepository,
  UpdateTribeSubscriptionPriceCommand,
} from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {
  MercadoPagoPlanInput,
  MercadoPagoPlanUpdateInput,
  MercadoPagoPreapprovalPlanInput,
  MercadoPagoPreapprovalPlanResult,
  MercadoPagoPreapprovalStatusInput,
  MercadoPagoPreapprovalPlanStatusInput,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import {
  resolveMercadoPagoAccessToken,
  type MercadoPagoAccessTokenRefresher,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MercadoPagoPlanCreator = (input: MercadoPagoPlanInput) => Promise<string>;
type MercadoPagoPlanGetter = (
  input: MercadoPagoPreapprovalPlanInput
) => Promise<MercadoPagoPreapprovalPlanResult | null>;
type MercadoPagoPlanStatusGetter = (
  input: MercadoPagoPreapprovalPlanStatusInput
) => Promise<string | null>;
type MercadoPagoPlanUpdater = (
  input: MercadoPagoPlanUpdateInput
) => Promise<MercadoPagoPreapprovalPlanResult>;
type MercadoPagoSubscriptionStatusGetter = (
  input: MercadoPagoPreapprovalStatusInput
) => Promise<string>;

type SubscriptionPriceRow = {
  active_subscribers_count: number | string | null;
  amount_cents: number;
  created_at: Date | string;
  currency: "ARS";
  frequency: "monthly";
  id: string;
  is_current: boolean;
  name: string;
  status: "active" | "canceled" | "deleted";
};

type SubscriptionPriceListRow = SubscriptionPriceRow & {
  can_manage_prices: boolean | null;
  can_view_prices: boolean | null;
  has_mercado_pago_integration: boolean | null;
};

type SubscriptionPriceMutationRow = SubscriptionPriceRow & {
  status_result: string | null;
};

type SubscriptionProviderPlanRow = SubscriptionPriceRow & {
  mercado_pago_preapproval_plan_id: string | null;
  tribe_id?: string;
};

type SubscriptionProviderSubscriberRow = {
  mercado_pago_preapproval_id: string | null;
};

type PriceCreationContextRow = {
  access_token: string | null;
  can_manage_prices: boolean | null;
  existing_price_count: number | string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PriceVerificationContextRow = {
  access_token: string | null;
  can_manage_prices: boolean | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PriceReservationRow = {
  reserved_price_id: string | null;
  status_result: string | null;
};

type PriceUpdateContextRow = SubscriptionProviderPlanRow & {
  access_token: string | null;
  can_manage_prices: boolean | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PriceCancellationReservationRow = PriceUpdateContextRow & {
  was_current: boolean | null;
};

type ProviderPlanWebhookContextRow = SubscriptionProviderPlanRow & {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

const SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS =
  "pending_provider_plan";

const MERCADO_PAGO_PROVIDER_PLAN_STATUS = {
  active: "active",
  canceled: "canceled",
} as const;

const MERCADO_PAGO_PROVIDER_SUBSCRIPTION_CANCELED_STATUS = {
  canceled: "canceled",
  cancelled: "cancelled",
} as const;

/**
 * Determines whether Mercado Pago still treats a subscription as attached.
 *
 * @param providerSubscriptionStatus - Subscription status returned by Mercado Pago.
 * @returns Whether the subscription is not effectively canceled.
 */
function isProviderSubscriptionStillAttached(
  providerSubscriptionStatus: string
): boolean {
  return (
    providerSubscriptionStatus !==
      MERCADO_PAGO_PROVIDER_SUBSCRIPTION_CANCELED_STATUS.canceled &&
    providerSubscriptionStatus !==
      MERCADO_PAGO_PROVIDER_SUBSCRIPTION_CANCELED_STATUS.cancelled
  );
}

/**
 * Converts database dates and counts into application price results.
 *
 * @param row - Database subscription price row.
 * @returns Subscription price application result.
 */
function mapSubscriptionPrice(row: SubscriptionPriceRow): TribeSubscriptionPriceResult {
  return {
    activeSubscribersCount: Number(row.active_subscribers_count ?? 0),
    amountCents: row.amount_cents,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    currency: row.currency,
    frequency: row.frequency,
    id: row.id,
    isCurrent: row.is_current,
    name: row.name,
    status: row.status,
  };
}

/**
 * Builds the local external reference stored in Mercado Pago plans.
 *
 * @param priceId - Local subscription price identifier.
 * @returns Provider external reference for a LaTribu price.
 */
function buildPriceExternalReference(priceId: string): string {
  return `latribu:price:${priceId}`;
}

/**
 * Reads a local price identifier from a Mercado Pago external reference.
 *
 * @param externalReference - Provider external reference value.
 * @returns Local price identifier, or null when the reference is not from LaTribu.
 */
function parsePriceIdFromExternalReference(
  externalReference: string | null
): string | null {
  const prefix = "latribu:price:";

  return externalReference?.startsWith(prefix)
    ? externalReference.slice(prefix.length)
    : null;
}

/**
 * Builds a stable idempotency key for one reserved Mercado Pago plan creation.
 *
 * @param command - Price creation command.
 * @param reservedPriceId - Local price reservation identifier linked to the provider plan.
 * @returns Stable key scoped to the local reservation and price content.
 */
function buildPlanIdempotencyKey(
  command: CreateTribeSubscriptionPriceCommand,
  reservedPriceId: string
): string {
  return [
    "tribe-price",
    reservedPriceId,
    command.tribeSlug,
    command.name,
    String(command.amountCents),
    command.currency,
    command.frequency,
  ].join(":");
}

/**
 * Maps a price mutation SQL result into the application contract.
 *
 * @param row - Database mutation row.
 * @param successStatus - Expected success status for the mutation.
 * @returns Price mutation result.
 */
function mapPriceMutationResult(
  row: SubscriptionPriceMutationRow | null,
  successStatus:
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.created
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.current
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.updated
): TribeSubscriptionPriceMutationResult {
  if (row?.status_result === successStatus) {
    return {
      price: mapSubscriptionPrice(row),
      status: successStatus,
    };
  }

  return {
    status:
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
        ? row.status_result
        : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
  };
}

export class PostgresTribeSubscriptionPriceRepository
  implements TribeSubscriptionPriceRepository
{
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly createMercadoPagoPlan: MercadoPagoPlanCreator,
    private readonly updateMercadoPagoPlan: MercadoPagoPlanUpdater,
    private readonly getMercadoPagoPlan: MercadoPagoPlanGetter,
    private readonly refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher,
    private readonly getMercadoPagoPlanStatus: MercadoPagoPlanStatusGetter,
    private readonly getMercadoPagoSubscriptionStatus: MercadoPagoSubscriptionStatusGetter
  ) {}

  /**
   * Lists subscription price versions visible to subscription admins.
   *
   * @param query - Tribe slug query.
   * @returns Prices and viewer permissions.
   */
  async listByTribeSlug(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionPriceListResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${query.tribeSlug}
          limit 1
        ),
        viewer_permissions as (
          select
            coalesce(public.can_view_tribe_subscription_prices((select id from target_tribe)), false) as can_view_prices,
            coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices
        ),
        payment_integration as (
          select exists (
            select 1
            from public.tribe_payment_integrations
            where tribe_payment_integrations.tribe_id = (select id from target_tribe)
              and tribe_payment_integrations.provider = 'mercado_pago'
              and tribe_payment_integrations.access_token is not null
              and (
                tribe_payment_integrations.token_expires_at is null
                or tribe_payment_integrations.token_expires_at > timezone('utc', now()) + interval '5 minutes'
                or tribe_payment_integrations.refresh_token is not null
              )
          ) as has_mercado_pago_integration
        ),
        price_rows as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.created_at,
            count(tribe_member_subscriptions.id) filter (
              where tribe_member_subscriptions.status in ('active', 'pending', 'grace_period', 'past_due', 'payment_blocked')
            ) as active_subscribers_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          left join public.tribe_member_subscriptions
            on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
          where tribe_subscription_prices.status in ('active', 'canceled')
            and public.can_view_tribe_subscription_prices(target_tribe.id)
          group by tribe_subscription_prices.id
        )
        select
          price_rows.id,
          price_rows.name,
          price_rows.amount_cents,
          price_rows.currency,
          price_rows.frequency,
          price_rows.status,
          price_rows.is_current,
          price_rows.created_at,
          price_rows.active_subscribers_count,
          viewer_permissions.can_view_prices,
          viewer_permissions.can_manage_prices,
          payment_integration.has_mercado_pago_integration
        from viewer_permissions
        cross join payment_integration
        left join price_rows
          on true
        order by price_rows.created_at desc
      `);
      const rows = (result.rows ?? []) as SubscriptionPriceListRow[];

      const prices = rows.reduce<ReturnType<typeof mapSubscriptionPrice>[]>(
        (mappedPrices, row) => {
          if (row.id) {
            mappedPrices.push(mapSubscriptionPrice(row));
          }

          return mappedPrices;
        },
        []
      );

      return {
        hasMercadoPagoIntegration: Boolean(
          rows[0]?.has_mercado_pago_integration
        ),
        prices,
        viewerPermissions: {
          canManagePrices: Boolean(rows[0]?.can_manage_prices),
          canViewPrices: Boolean(rows[0]?.can_view_prices),
        },
      };
    });
  }

  /**
   * Creates a new immutable price version and matching Mercado Pago plan.
   *
   * @param command - Normalized price creation command.
   * @returns Price creation result.
   */
  async create(
    command: CreateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const creationContext = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        ),
        active_prices as (
          select count(*) as existing_price_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.status in (
            'active',
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          )
        )
        select
          (select id from target_tribe) as tribe_id,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          (select existing_price_count from active_prices) as existing_price_count,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as
        | PriceCreationContextRow
        | null;
    });

    if (!creationContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!creationContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    if (
      Number(creationContext.existing_price_count ?? 0) >=
        TRIBE_SUBSCRIPTION_PRICE_LIMIT
    ) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached };
    }

    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: creationContext.access_token,
        refreshToken: creationContext.refresh_token,
        tokenExpiresAt: creationContext.token_expires_at,
        tribeId: creationContext.tribe_id,
      },
    }).catch(() => null);

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const reservation = await this.reserveProviderPlanPrice(command);

    if (reservation.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.created) {
      return {
        status:
          reservation.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound ||
          reservation.status_result ===
            TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached
            ? reservation.status_result
            : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
      };
    }

    if (!reservation.reserved_price_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    let mercadoPagoPlanId: string;

    try {
      mercadoPagoPlanId = await this.createMercadoPagoPlan({
        accessToken,
        amountCents: command.amountCents,
        currency: command.currency,
        externalReference: buildPriceExternalReference(
          reservation.reserved_price_id
        ),
        idempotencyKey: buildPlanIdempotencyKey(
          command,
          reservation.reserved_price_id
        ),
        name: command.name,
        reason: command.name,
      });
    } catch (error) {
      await this.releaseProviderPlanPriceReservation(reservation.reserved_price_id);

      throw error;
    }

    return this.attachProviderPlanToReservedPrice({
      mercadoPagoPlanId,
      priceId: reservation.reserved_price_id,
    });
  }

  private async reserveProviderPlanPrice(
    command: CreateTribeSubscriptionPriceCommand
  ): Promise<PriceReservationRow> {
    return this.executeWithDatabase(async (database) => {
      const reservationResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        ),
        active_prices_before_insert as (
          select count(*) as existing_price_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.status in (
            'active',
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          )
        ),
        reserved_price as (
          insert into public.tribe_subscription_prices (
            tribe_id,
            name,
            amount_cents,
            currency,
            frequency,
            status,
            is_current,
            mercado_pago_preapproval_plan_id,
            created_by,
            created_at
          )
          select
            target_tribe.id,
            ${command.name},
            ${command.amountCents},
            ${command.currency},
            ${command.frequency},
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS},
            false,
            null,
            public.current_app_user_id(),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_subscription_prices(target_tribe.id)
            and (
              select existing_price_count
              from active_prices_before_insert
            ) < ${TRIBE_SUBSCRIPTION_PRICE_LIMIT}
          returning id
        )
        select
          case
            when exists (select 1 from reserved_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.created}
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when (
              select existing_price_count
              from active_prices_before_insert
            ) >= ${TRIBE_SUBSCRIPTION_PRICE_LIMIT} then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status_result,
          (select id from reserved_price) as reserved_price_id
      `);

      return (reservationResult.rows?.[0] ?? null) as PriceReservationRow;
    });
  }

  private async releaseProviderPlanPriceReservation(priceId: string): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        update public.tribe_subscription_prices
        set
          status = 'deleted',
          deleted_at = timezone('utc', now())
        where tribe_subscription_prices.id = ${priceId}
          and tribe_subscription_prices.status = ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          and tribe_subscription_prices.mercado_pago_preapproval_plan_id is null
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
      `);
    });
  }

  private async attachProviderPlanToReservedPrice(input: {
    mercadoPagoPlanId: string;
    priceId: string;
  }): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const activationResult = await database.execute(sql`
        update public.tribe_subscription_prices
        set
          mercado_pago_preapproval_plan_id = ${input.mercadoPagoPlanId},
          status = 'active'
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning id, name, amount_cents, currency, frequency, status, is_current, created_at
      `);

      return mapPriceMutationResult(
        (activationResult.rows?.[0]
          ? {
              ...activationResult.rows[0],
              active_subscribers_count: 0,
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            }
          : null) as SubscriptionPriceMutationRow | null,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.created
      );
    });
  }

  /**
   * Updates a price name in place or creates a new version when the amount changes.
   *
   * @param command - Normalized price update command.
   * @returns Price update or version creation result.
   */
  async update(
    command: UpdateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const updateContext = await this.resolvePriceUpdateContext(command);

    if (!updateContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!updateContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const amountHasChanged = updateContext.amount_cents !== command.amountCents;

    if (amountHasChanged) {
      const createdPriceResult = await this.create({
        amountCents: command.amountCents,
        currency: command.currency,
        frequency: command.frequency,
        name: command.name,
        tribeSlug: command.tribeSlug,
      });

      if (
        createdPriceResult.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.created &&
        updateContext.is_current
      ) {
        return this.makeCurrent({
          priceId: createdPriceResult.price.id,
          tribeSlug: command.tribeSlug,
        });
      }

      return createdPriceResult;
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      updateContext
    );

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    if (updateContext.mercado_pago_preapproval_plan_id) {
      await this.updateMercadoPagoPlan({
        accessToken,
        externalReference: buildPriceExternalReference(command.priceId),
        preapprovalPlanId: updateContext.mercado_pago_preapproval_plan_id,
        reason: command.name,
        status: MERCADO_PAGO_PROVIDER_PLAN_STATUS.active,
      });
    }

    return this.updateLocalPriceName(command);
  }

  /**
   * Resolves the local price, permissions, and provider token state for mutations.
   *
   * @param command - Price update command.
   * @returns Price update context row, or null when no row is available.
   */
  private async resolvePriceUpdateContext(
    command: TribeSubscriptionPriceIdentity
  ): Promise<PriceUpdateContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.created_at,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
          limit 1
        )
        select
          target_price.id,
          target_price.tribe_id,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.created_at,
          target_price.mercado_pago_preapproval_plan_id,
          0 as active_subscribers_count,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join target_price
          on true
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as PriceUpdateContextRow | null;
    });
  }

  /**
   * Resolves an access token for provider mutations from a stored context row.
   *
   * @param mutationContext - Stored provider token context.
   * @returns Fresh provider access token, or null when unavailable.
   */
  private async resolveAccessTokenForProviderMutation(
    mutationContext: PriceUpdateContextRow | PriceCreationContextRow
  ): Promise<string | null> {
    return resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: mutationContext.access_token,
        refreshToken: mutationContext.refresh_token,
        tokenExpiresAt: mutationContext.token_expires_at,
        tribeId: mutationContext.tribe_id,
      },
    }).catch(() => null);
  }

  /**
   * Persists a mutable local price name after Mercado Pago accepts the change.
   *
   * @param command - Price update command.
   * @returns Updated price mutation result.
   */
  private async updateLocalPriceName(
    command: UpdateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        updated_price as (
          update public.tribe_subscription_prices
          set name = ${command.name}
          where tribe_subscription_prices.tribe_id = (select id from target_tribe)
            and tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          returning id, name, amount_cents, currency, frequency, status, is_current, created_at
        )
        select
          ${TRIBE_SUBSCRIPTION_PRICE_STATUS.updated} as status_result,
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.created_at,
          0 as active_subscribers_count
        from updated_price
      `);

      return mapPriceMutationResult(
        (result.rows?.[0] ?? null) as SubscriptionPriceMutationRow | null,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.updated
      );
    });
  }

  /**
   * Marks a price as current for new members without touching existing subscribers.
   *
   * @param command - Price identity command.
   * @returns Current price mutation result.
   */
  async makeCurrent(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const targetResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.created_at
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
          limit 1
        )
        select
          case
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not exists (select 1 from target_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not public.can_manage_tribe_subscription_prices((select id from target_tribe)) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current}
          end as status_result,
          target_price.id,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.created_at,
          0 as active_subscribers_count
        from (select 1) result
        left join target_price
          on true
      `);
      const targetRow = (targetResult.rows?.[0] ?? null) as
        | SubscriptionPriceMutationRow
        | null;

      if (targetRow?.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.current) {
        return mapPriceMutationResult(
          targetRow,
          TRIBE_SUBSCRIPTION_PRICE_STATUS.current
        );
      }

      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set is_current = false
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.id <> ${command.priceId}
          and tribe_subscription_prices.is_current = true
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
      `);

      const currentResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        updated_current_price as (
          update public.tribe_subscription_prices
          set is_current = true
          where tribe_subscription_prices.tribe_id = (select id from target_tribe)
            and tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          returning id, name, amount_cents, currency, frequency, status, is_current, created_at
        )
        select
          case
            when exists (select 1 from updated_current_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status_result,
          updated_current_price.id,
          updated_current_price.name,
          updated_current_price.amount_cents,
          updated_current_price.currency,
          updated_current_price.frequency,
          updated_current_price.status,
          updated_current_price.is_current,
          updated_current_price.created_at,
          0 as active_subscribers_count
        from (select 1) result
        left join updated_current_price
          on true
      `);

      return mapPriceMutationResult(
        (currentResult.rows?.[0] ?? null) as SubscriptionPriceMutationRow | null,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.current
      );
    });
  }

  /**
   * Verifies all active local prices against their Mercado Pago plan.
   *
   * @param query - Tribe slug query.
   * @returns Provider plan verification result with the refreshed price list.
   */
  async verifyProviderPlans(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionProviderPlansVerificationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      query.tribeSlug
    );
    const accessToken = await this.resolveVerificationAccessToken(
      verificationContext
    );

    if ("status" in accessToken) {
      return accessToken;
    }

    const providerPlanPrices = await this.listProviderPlanPrices({
      tribeSlug: query.tribeSlug,
    });
    const canceledPrices = await Promise.all(
      providerPlanPrices.map(async (providerPlanPrice) => {
        const providerPlanStatus =
          providerPlanPrice.mercado_pago_preapproval_plan_id
            ? await this.getMercadoPagoPlanStatus({
                accessToken: accessToken.value,
                preapprovalPlanId:
                  providerPlanPrice.mercado_pago_preapproval_plan_id,
              })
            : null;

        return providerPlanStatus !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active
          ? this.cancelProviderPlanPrice({
              priceId: providerPlanPrice.id,
              tribeSlug: query.tribeSlug,
            })
          : null;
      })
    );
    const canceledPriceIds = canceledPrices.reduce<string[]>(
      (priceIds, canceledPrice) => {
        if (canceledPrice) {
          priceIds.push(canceledPrice.id);
        }

        return priceIds;
      },
      []
    );

    const refreshedPriceList = await this.listByTribeSlug(query);

    return {
      canceledPriceIds,
      prices: refreshedPriceList.prices,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: providerPlanPrices.length,
    };
  }

  /**
   * Verifies one active local price against its Mercado Pago plan.
   *
   * @param command - Price identity command.
   * @returns Provider plan verification result.
   */
  async verifyProviderPlan(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionProviderPlanVerificationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      command.tribeSlug
    );
    const accessToken = await this.resolveVerificationAccessToken(
      verificationContext
    );

    if ("status" in accessToken) {
      return accessToken;
    }

    const providerPlanPrice = (
      await this.listProviderPlanPrices({
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
      })
    )[0];

    if (!providerPlanPrice) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const providerPlanStatus =
      providerPlanPrice.mercado_pago_preapproval_plan_id
        ? await this.getMercadoPagoPlanStatus({
            accessToken: accessToken.value,
            preapprovalPlanId: providerPlanPrice.mercado_pago_preapproval_plan_id,
          })
        : null;

    if (providerPlanStatus !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
      const canceledPrice = await this.cancelProviderPlanPrice({
        priceId: providerPlanPrice.id,
        tribeSlug: command.tribeSlug,
      });

      return {
        price: canceledPrice ?? {
          ...mapSubscriptionPrice(providerPlanPrice),
          isCurrent: false,
          status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
        },
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      };
    }

    return {
      price: mapSubscriptionPrice(providerPlanPrice),
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    };
  }

  /**
   * Verifies real Mercado Pago subscribers for one local price.
   *
   * @param command - Price identity command.
   * @returns Provider subscriber verification result with a provider-backed count.
   */
  async verifyProviderSubscribers(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionProviderSubscribersVerificationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      command.tribeSlug
    );
    const accessToken = await this.resolveVerificationAccessToken(
      verificationContext
    );

    if ("status" in accessToken) {
      return accessToken;
    }

    const providerPlanPrice = (
      await this.listProviderPlanPrices({
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
      })
    )[0];

    if (!providerPlanPrice) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const providerSubscribers = await this.listProviderSubscribers({
      priceId: command.priceId,
      tribeSlug: command.tribeSlug,
    });
    const providerSubscriptionStatuses = await Promise.all(
      providerSubscribers.map((providerSubscriber) =>
        providerSubscriber.mercado_pago_preapproval_id
          ? this.getMercadoPagoSubscriptionStatus({
          accessToken: accessToken.value,
          preapprovalId: providerSubscriber.mercado_pago_preapproval_id,
            })
          : Promise.resolve(null)
      )
    );
    const activeSubscribersCount = providerSubscriptionStatuses.filter(
      (providerSubscriptionStatus) =>
        providerSubscriptionStatus
          ? isProviderSubscriptionStillAttached(providerSubscriptionStatus)
          : false
    ).length;

    return {
      price: mapSubscriptionPrice(providerPlanPrice),
      providerActiveSubscribersCount: activeSubscribersCount,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: providerSubscribers.length,
    };
  }

  /**
   * Synchronizes a Mercado Pago plan webhook into the linked local price.
   *
   * @param command - Provider plan webhook command.
   * @returns Provider plan synchronization result.
   */
  async syncProviderPlan(
    command: SyncTribeSubscriptionProviderPlanCommand
  ): Promise<TribeSubscriptionProviderPlanSyncResult> {
    const webhookContext = await this.resolveProviderPlanWebhookContext(
      command.resourceId
    );

    if (!webhookContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation({
      ...webhookContext,
      can_manage_prices: true,
    });

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const webhookRegistration = {
      eventId: command.eventId,
      resourceId: command.resourceId,
      topic: command.topic,
      tribeId: webhookContext.tribe_id,
    };
    const shouldProcessWebhook = await this.registerProviderPlanWebhook(
      webhookRegistration
    );

    if (!shouldProcessWebhook) {
      return {
        price: mapSubscriptionPrice(webhookContext),
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      };
    }

    try {
      const providerPlan = await this.getMercadoPagoPlan({
        accessToken,
        preapprovalPlanId: command.resourceId,
      });
      const linkedPriceId = parsePriceIdFromExternalReference(
        providerPlan?.externalReference ?? null
      );

      if (linkedPriceId && linkedPriceId !== webhookContext.id) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
      }

      if (providerPlan?.status !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
        const canceledPrice = await this.cancelProviderPlanPriceFromWebhook({
          priceId: webhookContext.id,
        });

        return canceledPrice
          ? {
              price: canceledPrice,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
            }
          : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
      }

      const updatedPrice = await this.updateLocalPriceNameFromWebhook({
        name: providerPlan.reason ?? webhookContext.name,
        priceId: webhookContext.id,
      });

      return updatedPrice
        ? {
            price: updatedPrice,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
          }
        : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    } catch (error) {
      await this.releaseProviderPlanWebhookRegistration(webhookRegistration);

      throw error;
    }
  }

  /**
   * Resolves a local price and provider token context from a Mercado Pago plan id.
   *
   * @param providerPlanId - Mercado Pago preapproval plan identifier.
   * @returns Webhook synchronization context, or null when no linked price exists.
   */
  private async resolveProviderPlanWebhookContext(
    providerPlanId: string
  ): Promise<ProviderPlanWebhookContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribe_subscription_prices.id,
          tribe_subscription_prices.tribe_id,
          tribe_subscription_prices.name,
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.status,
          tribe_subscription_prices.is_current,
          tribe_subscription_prices.created_at,
          tribe_subscription_prices.mercado_pago_preapproval_plan_id,
          0 as active_subscribers_count,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from public.tribe_subscription_prices
        inner join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = tribe_subscription_prices.tribe_id
          and tribe_payment_integrations.provider = 'mercado_pago'
        where tribe_subscription_prices.mercado_pago_preapproval_plan_id = ${providerPlanId}
          and tribe_subscription_prices.status in ('active', 'canceled')
        limit 1
      `);

      return (result.rows?.[0] ?? null) as
        | ProviderPlanWebhookContextRow
        | null;
    });
  }

  /**
   * Registers a provider plan webhook for idempotent processing.
   *
   * @param input - Webhook identity and local tribe context.
   * @returns Whether the webhook was newly registered and should be processed.
   */
  private async registerProviderPlanWebhook(input: {
    eventId: string;
    resourceId: string;
    topic: string;
    tribeId: string;
  }): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const operationKey = `mercado-pago-plan-webhook:${input.eventId}`;
      const result = await database.execute(sql`
        insert into public.subscription_idempotency_operations (
          operation_key,
          operation_type,
          tribe_id,
          user_id,
          payload_hash,
          response_body
        )
        values (
          ${operationKey},
          'mercado_pago_plan_webhook',
          ${input.tribeId},
          null,
          ${input.topic + ":" + input.resourceId},
          '{}'::jsonb
        )
        on conflict (operation_key) do nothing
        returning id
      `);

      return Boolean(result.rows?.[0]);
    });
  }

  /**
   * Releases a failed provider plan webhook registration so Mercado Pago can retry it.
   *
   * @param input - Webhook identity and local tribe context.
   * @returns Promise resolved after the registration is removed.
   */
  private async releaseProviderPlanWebhookRegistration(input: {
    eventId: string;
    resourceId: string;
    topic: string;
    tribeId: string;
  }): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      const operationKey = `mercado-pago-plan-webhook:${input.eventId}`;

      await database.execute(sql`
        delete from public.subscription_idempotency_operations
        where subscription_idempotency_operations.operation_key = ${operationKey}
          and subscription_idempotency_operations.operation_type = 'mercado_pago_plan_webhook'
          and subscription_idempotency_operations.tribe_id = ${input.tribeId}
          and subscription_idempotency_operations.payload_hash = ${input.topic + ":" + input.resourceId}
      `);
    });
  }

  /**
   * Updates a local price name from a verified Mercado Pago webhook.
   *
   * @param input - Local price identifier and provider plan name.
   * @returns Updated price, or null when no row was changed.
   */
  private async updateLocalPriceNameFromWebhook(input: {
    name: string;
    priceId: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.tribe_subscription_prices
        set name = ${input.name}
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = 'active'
        returning id, name, amount_cents, currency, frequency, status, is_current, created_at, 0 as active_subscribers_count
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Cancels a local price from a verified Mercado Pago webhook.
   *
   * @param input - Local price identifier.
   * @returns Updated price, or null when no row was changed.
   */
  private async cancelProviderPlanPriceFromWebhook(input: {
    priceId: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.tribe_subscription_prices
        set
          status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled},
          is_current = false,
          mercado_pago_preapproval_plan_id = null
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = 'active'
        returning id, name, amount_cents, currency, frequency, status, is_current, created_at, 0 as active_subscribers_count
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Resolves authorization and token context for provider plan verification.
   *
   * @param tribeSlug - Tribe slug used to scope the verification.
   * @returns Database context required to call Mercado Pago.
   */
  private async resolveProviderPlanVerificationContext(
    tribeSlug: string
  ): Promise<PriceVerificationContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          (select id from target_tribe) as tribe_id,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as PriceVerificationContextRow | null;
    });
  }

  /**
   * Resolves a fresh access token or a stable verification failure status.
   *
   * @param verificationContext - Database context for the tribe integration.
   * @returns Access token wrapper or a verification failure result.
   */
  private async resolveVerificationAccessToken(
    verificationContext: PriceVerificationContextRow | null
  ): Promise<
    | {
        value: string;
      }
    | {
        status:
          | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
          | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
          | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound;
      }
  > {
    if (!verificationContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!verificationContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: verificationContext.access_token,
        refreshToken: verificationContext.refresh_token,
        tokenExpiresAt: verificationContext.token_expires_at,
        tribeId: verificationContext.tribe_id,
      },
    }).catch(() => null);

    return accessToken
      ? { value: accessToken }
      : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
  }

  /**
   * Lists local visible prices that can be verified against Mercado Pago.
   *
   * @param input - Tribe and optional price filter.
   * @returns Price rows with provider plan identifiers.
   */
  private async listProviderPlanPrices(input: {
    priceId?: string;
    tribeSlug: string;
  }): Promise<SubscriptionProviderPlanRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_subscription_prices.id,
          tribe_subscription_prices.name,
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.status,
          tribe_subscription_prices.is_current,
          tribe_subscription_prices.created_at,
          tribe_subscription_prices.mercado_pago_preapproval_plan_id,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ('active', 'pending', 'grace_period', 'past_due', 'payment_blocked')
          ) as active_subscribers_count
        from public.tribe_subscription_prices
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
        where tribe_subscription_prices.status = 'active'
          and (${input.priceId ?? ""} = '' or tribe_subscription_prices.id::text = ${input.priceId ?? ""})
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
        group by tribe_subscription_prices.id
        order by tribe_subscription_prices.created_at desc
      `);

      return (result.rows ?? []) as SubscriptionProviderPlanRow[];
    });
  }

  /**
   * Lists local provider subscriber identifiers attached to a price.
   *
   * @param input - Tribe and price identifiers used to scope subscribers.
   * @returns Provider subscriber identifiers persisted for the price.
   */
  private async listProviderSubscribers(input: {
    priceId: string;
    tribeSlug: string;
  }): Promise<SubscriptionProviderSubscriberRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select tribe_member_subscriptions.mercado_pago_preapproval_id
        from public.tribe_member_subscriptions
        inner join public.tribe_subscription_prices
          on tribe_subscription_prices.id = tribe_member_subscriptions.price_id
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status in ('active', 'canceled')
          and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
      `);

      return (result.rows ?? []) as SubscriptionProviderSubscriberRow[];
    });
  }

  /**
   * Cancels a local price after provider plan verification proves it is gone.
   *
   * @param input - Tribe slug and price identifier.
   * @returns Updated price, or null when no row was updated.
   */
  private async cancelProviderPlanPrice(input: {
    priceId: string;
    tribeSlug: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        updated_price as (
        update public.tribe_subscription_prices
        set
          status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled},
          is_current = false,
          mercado_pago_preapproval_plan_id = null
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = 'active'
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning id, name, amount_cents, currency, frequency, status, is_current, created_at
        )
        select
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.created_at,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ('active', 'pending', 'grace_period', 'past_due', 'payment_blocked')
          ) as active_subscribers_count
        from updated_price
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = updated_price.id
        group by
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.created_at
      `);

      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Cancels a provider plan and marks the local price as canceled.
   *
   * @param command - Price identity command.
   * @returns Price cancellation result.
   */
  async delete(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const updateContext = await this.resolvePriceUpdateContext(command);

    if (!updateContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!updateContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const hasAssociatedMembers = await this.hasAssociatedSubscriptions(command.priceId);

    if (hasAssociatedMembers) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers };
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      updateContext
    );

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const cancellationReservation =
      await this.reserveProviderPlanPriceCancellation(command);

    if (!cancellationReservation?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!cancellationReservation.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    if (Number(cancellationReservation.active_subscribers_count ?? 0) > 0) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers };
    }

    try {
      if (cancellationReservation.mercado_pago_preapproval_plan_id) {
        await this.updateMercadoPagoPlan({
          accessToken,
          externalReference: buildPriceExternalReference(command.priceId),
          preapprovalPlanId: cancellationReservation.mercado_pago_preapproval_plan_id,
          reason: cancellationReservation.name,
          status: MERCADO_PAGO_PROVIDER_PLAN_STATUS.canceled,
        });
      }
    } catch (error) {
      await this.restoreProviderPlanPriceCancellationReservation({
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
        wasCurrent: Boolean(cancellationReservation.was_current),
      });

      throw error;
    }

    const canceledPrice = await this.cancelProviderPlanPrice(command);

    return canceledPrice
      ? {
          price: canceledPrice,
          status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
        }
      : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
  }

  /**
   * Temporarily removes a price from checkout selection before provider cancellation.
   *
   * @param command - Price identity command.
   * @returns Cancellation reservation context, or null when no row is available.
   */
  private async reserveProviderPlanPriceCancellation(
    command: TribeSubscriptionPriceIdentity
  ): Promise<PriceCancellationReservationRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.created_at,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
          limit 1
          for update
        ),
        associated_members as (
          select tribe_member_subscriptions.id
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = (select id from target_price)
          limit 1
        ),
        reserved_price as (
          update public.tribe_subscription_prices
          set is_current = false
          where tribe_subscription_prices.id = (select id from target_price)
            and not exists (select 1 from associated_members)
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          returning
            id,
            tribe_id,
            name,
            amount_cents,
            currency,
            frequency,
            status,
            is_current,
            created_at,
            mercado_pago_preapproval_plan_id
        )
        select
          coalesce(reserved_price.id, target_price.id) as id,
          coalesce(reserved_price.tribe_id, target_price.tribe_id) as tribe_id,
          coalesce(reserved_price.name, target_price.name) as name,
          coalesce(reserved_price.amount_cents, target_price.amount_cents) as amount_cents,
          coalesce(reserved_price.currency, target_price.currency) as currency,
          coalesce(reserved_price.frequency, target_price.frequency) as frequency,
          coalesce(reserved_price.status, target_price.status) as status,
          coalesce(reserved_price.is_current, target_price.is_current) as is_current,
          target_price.is_current as was_current,
          coalesce(reserved_price.created_at, target_price.created_at) as created_at,
          coalesce(
            reserved_price.mercado_pago_preapproval_plan_id,
            target_price.mercado_pago_preapproval_plan_id
          ) as mercado_pago_preapproval_plan_id,
          case when exists (select 1 from associated_members) then 1 else 0 end as active_subscribers_count,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join target_price
          on true
        left join reserved_price
          on true
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as
        | PriceCancellationReservationRow
        | null;
    });
  }

  /**
   * Restores current price selection after a provider cancellation failure.
   *
   * @param input - Price identity and previous current state.
   * @returns Promise resolved after the local reservation is restored.
   */
  private async restoreProviderPlanPriceCancellationReservation(input: {
    priceId: string;
    tribeSlug: string;
    wasCurrent: boolean;
  }): Promise<void> {
    if (!input.wasCurrent) {
      return;
    }

    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set is_current = true
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = 'active'
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          and not exists (
            select 1
            from public.tribe_subscription_prices existing_current_price
            where existing_current_price.tribe_id = tribe_subscription_prices.tribe_id
              and existing_current_price.status = 'active'
              and existing_current_price.is_current = true
          )
      `);
    });
  }

  /**
   * Checks whether a local price has any associated member subscriptions.
   *
   * @param priceId - Local subscription price identifier.
   * @returns Whether the price has associated subscriptions.
   */
  private async hasAssociatedSubscriptions(priceId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select exists (
          select 1
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = ${priceId}
          limit 1
        ) as has_associated_subscriptions
      `);

      return Boolean(
        (
          result.rows?.[0] as
            | {
                has_associated_subscriptions?: boolean;
              }
            | undefined
        )?.has_associated_subscriptions
      );
    });
  }
}
