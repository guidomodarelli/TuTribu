/**
 * Persists Mercado Pago integration tokens for tribe leaders.
 *
 * @module postgres-tribe-payment-integration-repository
 */

import { sql } from "drizzle-orm";

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  ConnectTribePaymentIntegrationCommand,
  TribePaymentIntegrationAccountResult,
  TribePaymentIntegrationRepository,
  TribePaymentIntegrationResult,
  UpdateTribePaymentIntegrationAccountLabelCommand,
} from "@/src/modules/subscriptions/domain/repositories/tribe-payment-integration-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type IntegrationMutationRow = {
  account_label?: string | null;
  id?: string | null;
  mutation_status?: string | null;
  provider_account_email?: string | null;
  provider_account_id?: string | null;
  status: string | null;
};

/**
 * Maps a database integration mutation row to the application contract.
 *
 * @param row - Database mutation row.
 * @returns Integration mutation result.
 */
function mapIntegrationResult(
  row: IntegrationMutationRow | null
): TribePaymentIntegrationResult {
  if (
    row?.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.connected ||
    row?.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput ||
    row?.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound
  ) {
    return { status: row.status };
  }

  return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
}

/**
 * Maps an updated account row to the account result contract.
 *
 * @param row - Database account row.
 * @returns Account result.
 */
function mapPaymentIntegrationAccount(
  row: IntegrationMutationRow
): TribePaymentIntegrationAccountResult {
  return {
    accountLabel: row.account_label ?? "",
    id: row.id ?? "",
    providerAccountEmail: row.provider_account_email ?? null,
    providerAccountId: row.provider_account_id ?? null,
    status: row.status ?? TRIBE_SUBSCRIPTION_PRICE_STATUS.connected,
  };
}

/**
 * Maps a database account update row to the application contract.
 *
 * @param row - Database mutation row.
 * @returns Integration mutation result.
 */
function mapAccountLabelUpdateResult(
  row: IntegrationMutationRow | null
): TribePaymentIntegrationResult {
  if (row?.mutation_status === TRIBE_SUBSCRIPTION_PRICE_STATUS.updated) {
    return {
      account: mapPaymentIntegrationAccount(row),
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    };
  }

  if (row?.mutation_status === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound) {
    return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
  }

  return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
}

export class PostgresTribePaymentIntegrationRepository
  implements TribePaymentIntegrationRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  /**
   * Upserts the current leader Mercado Pago integration for a tribe.
   *
   * @param command - OAuth token payload and tribe identity.
   * @returns Integration mutation result.
   */
  async connect(
    command: ConnectTribePaymentIntegrationCommand
  ): Promise<TribePaymentIntegrationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        updated_anonymous_integration as (
          update public.tribe_payment_integrations
          set
            status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.connected},
            access_token = ${command.accessToken},
            refresh_token = ${command.refreshToken},
            token_expires_at = case
              when ${command.expiresIn}::integer is null then null
              else timezone('utc', now()) + (${command.expiresIn}::integer || ' seconds')::interval
            end,
            connected_by = public.current_app_user_id(),
            updated_at = timezone('utc', now())
          where ${command.providerAccountId}::text is null
            and tribe_payment_integrations.provider_account_id is null
            and tribe_payment_integrations.tribe_id = (select id from target_tribe)
            and tribe_payment_integrations.provider = 'mercado_pago'
            and public.can_manage_tribe_subscription_prices(
              tribe_payment_integrations.tribe_id
            )
          returning id
        ),
        upserted_integration as (
          insert into public.tribe_payment_integrations (
            tribe_id,
            provider,
            provider_account_id,
            account_label,
            provider_account_email,
            status,
            access_token,
            refresh_token,
            token_expires_at,
            connected_by,
            created_at,
            updated_at
          )
          select
            target_tribe.id,
            'mercado_pago',
            ${command.providerAccountId},
            'Cuenta Mercado Pago',
            null,
            ${TRIBE_SUBSCRIPTION_PRICE_STATUS.connected},
            ${command.accessToken},
            ${command.refreshToken},
            case
              when ${command.expiresIn}::integer is null then null
              else timezone('utc', now()) + (${command.expiresIn}::integer || ' seconds')::interval
            end,
            public.current_app_user_id(),
            timezone('utc', now()),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_subscription_prices(target_tribe.id)
            and not exists (select 1 from updated_anonymous_integration)
          on conflict (tribe_id, provider, provider_account_id)
          where provider_account_id is not null
          do update
          set
            account_label = coalesce(
              nullif(public.tribe_payment_integrations.account_label, ''),
              excluded.account_label
            ),
            provider_account_email = coalesce(
              excluded.provider_account_email,
              public.tribe_payment_integrations.provider_account_email
            ),
            status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.connected},
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            token_expires_at = excluded.token_expires_at,
            connected_by = excluded.connected_by,
            updated_at = timezone('utc', now())
          returning id
        )
        select
          case
            when exists (select 1 from updated_anonymous_integration)
              or exists (select 1 from upserted_integration) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.connected}
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status
      `);

      return mapIntegrationResult(
        (result.rows?.[0] ?? null) as IntegrationMutationRow | null
      );
    });
  }

  /**
   * Updates the leader-facing label for one Mercado Pago account.
   *
   * @param command - Account label update command.
   * @returns Integration mutation result.
   */
  async updateAccountLabel(
    command: UpdateTribePaymentIntegrationAccountLabelCommand
  ): Promise<TribePaymentIntegrationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        updated_integration as (
          update public.tribe_payment_integrations
          set
            account_label = ${command.accountLabel},
            updated_at = timezone('utc', now())
          where tribe_payment_integrations.id = ${command.paymentIntegrationId}::uuid
            and tribe_payment_integrations.tribe_id = (select id from target_tribe)
            and tribe_payment_integrations.provider = 'mercado_pago'
            and public.can_manage_tribe_subscription_prices(
              tribe_payment_integrations.tribe_id
            )
          returning
            tribe_payment_integrations.id,
            tribe_payment_integrations.account_label,
            tribe_payment_integrations.provider_account_email,
            tribe_payment_integrations.provider_account_id,
            tribe_payment_integrations.status
        )
        select
          case
            when exists (select 1 from updated_integration) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as mutation_status,
          updated_integration.id,
          updated_integration.account_label,
          updated_integration.provider_account_email,
          updated_integration.provider_account_id,
          updated_integration.status
        from (select 1) as singleton
        left join updated_integration on true
      `);

      return mapAccountLabelUpdateResult(
        (result.rows?.[0] ?? null) as IntegrationMutationRow | null
      );
    });
  }
}
