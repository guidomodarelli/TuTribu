/**
 * Persists and maps tribe subscription price versions in Postgres.
 *
 * @module postgres-tribe-subscription-price-repository
 */

import { sql } from "drizzle-orm";

import type {
  TribeSubscriptionProviderPlanVerificationResult,
  TribeSubscriptionProviderPlansVerificationResult,
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
  TribeSubscriptionPriceIdentity,
  TribeSubscriptionPriceListQuery,
  TribeSubscriptionPriceRepository,
} from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {
  MercadoPagoPlanInput,
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
type MercadoPagoPlanStatusGetter = (
  input: MercadoPagoPreapprovalPlanStatusInput
) => Promise<string | null>;
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

const SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS =
  "pending_provider_plan";

const MERCADO_PAGO_PROVIDER_PLAN_STATUS = {
  active: "active",
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
 * Maps a price mutation SQL result into the application contract.
 *
 * @param row - Database mutation row.
 * @param successStatus - Expected success status for the mutation.
 * @returns Price mutation result.
 */
function mapPriceMutationResult(
  row: SubscriptionPriceMutationRow | null,
  successStatus:
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.created
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.current
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

/**
 * Builds a stable idempotency key for Mercado Pago plan creation.
 *
 * @param command - Price creation command.
 * @returns Stable key scoped to the tribe and price content.
 */
function buildPlanIdempotencyKey(command: CreateTribeSubscriptionPriceCommand): string {
  return [
    "tribe-price",
    command.tribeSlug,
    command.name,
    String(command.amountCents),
    command.currency,
    command.frequency,
  ].join(":");
}

export class PostgresTribeSubscriptionPriceRepository
  implements TribeSubscriptionPriceRepository
{
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly createMercadoPagoPlan: MercadoPagoPlanCreator,
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

      return {
        hasMercadoPagoIntegration: Boolean(
          rows[0]?.has_mercado_pago_integration
        ),
        prices: rows
          .filter((row) => row.id)
          .map((row) => mapSubscriptionPrice(row)),
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
        idempotencyKey: buildPlanIdempotencyKey(command),
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
    const canceledPriceIds: string[] = [];

    for (const providerPlanPrice of providerPlanPrices) {
      const providerPlanStatus =
        providerPlanPrice.mercado_pago_preapproval_plan_id
          ? await this.getMercadoPagoPlanStatus({
              accessToken: accessToken.value,
              preapprovalPlanId:
                providerPlanPrice.mercado_pago_preapproval_plan_id,
            })
          : null;

      if (providerPlanStatus !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
        const canceledPrice = await this.cancelProviderPlanPrice({
          priceId: providerPlanPrice.id,
          tribeSlug: query.tribeSlug,
        });

        if (canceledPrice) {
          canceledPriceIds.push(canceledPrice.id);
        }
      }
    }

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
    let activeSubscribersCount = 0;

    for (const providerSubscriber of providerSubscribers) {
      if (!providerSubscriber.mercado_pago_preapproval_id) {
        continue;
      }

      const providerSubscriptionStatus =
        await this.getMercadoPagoSubscriptionStatus({
          accessToken: accessToken.value,
          preapprovalId: providerSubscriber.mercado_pago_preapproval_id,
        });

      if (isProviderSubscriptionStillAttached(providerSubscriptionStatus)) {
        activeSubscribersCount += 1;
      }
    }

    return {
      price: mapSubscriptionPrice(providerPlanPrice),
      providerActiveSubscribersCount: activeSubscribersCount,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: providerSubscribers.length,
    };
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
   * Soft-deletes a price when no member subscription references it.
   *
   * @param command - Price identity command.
   * @returns Deletion result.
   */
  async delete(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select tribe_subscription_prices.id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
          limit 1
        ),
        associated_members as (
          select tribe_member_subscriptions.id
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = (select id from target_price)
          limit 1
        ),
        deleted_price as (
          update public.tribe_subscription_prices
          set
            status = 'deleted',
            is_current = false,
            deleted_at = timezone('utc', now())
          where tribe_subscription_prices.id = (select id from target_price)
            and not exists (select 1 from associated_members)
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          returning id
        )
        select
          case
            when exists (select 1 from deleted_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted}
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not exists (select 1 from target_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when exists (select 1 from associated_members) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status
      `);
      const status = (result.rows?.[0] as { status?: string } | undefined)?.status;

      return {
        status:
          status === TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted ||
          status === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound ||
          status === TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers
            ? status
            : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
      };
    });
  }
}
