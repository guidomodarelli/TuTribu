/**
 * Persists Mercado Pago integration tokens for tribe leaders.
 *
 * @module postgres-tribe-payment-integration-repository
 */

import { sql } from "drizzle-orm";

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  ConnectTribePaymentIntegrationCommand,
  TribePaymentIntegrationRepository,
  TribePaymentIntegrationResult,
} from "@/src/modules/subscriptions/domain/repositories/tribe-payment-integration-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type IntegrationMutationRow = {
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
    row?.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound
  ) {
    return { status: row.status };
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
        upserted_integration as (
          insert into public.tribe_payment_integrations (
            tribe_id,
            provider,
            provider_account_id,
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
          on conflict (tribe_id, provider) do update
          set
            provider_account_id = excluded.provider_account_id,
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            token_expires_at = excluded.token_expires_at,
            connected_by = excluded.connected_by,
            updated_at = timezone('utc', now())
          returning id
        )
        select
          case
            when exists (select 1 from upserted_integration) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.connected}
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status
      `);

      return mapIntegrationResult(
        (result.rows?.[0] ?? null) as IntegrationMutationRow | null
      );
    });
  }
}
