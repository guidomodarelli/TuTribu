/**
 * Persists Mercado Pago integration tokens for tribe leaders.
 *
 * @module postgres-tribe-payment-integration-repository
 */

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

type TargetTribeRow = {
  id: string;
};

const MERCADO_PAGO_PAYMENT_PROVIDER = "mercado_pago";

/**
 * Maps a database integration mutation row to the application contract.
 *
 * @param row - Database mutation row.
 * @returns Integration mutation result.
 */
function createTokenExpirationDate(expiresInSeconds: number | null): Date | null {
  if (expiresInSeconds === null) {
    return null;
  }

  return new Date(Date.now() + expiresInSeconds * 1000);
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
      const targetTribe = await this.findTargetTribe(
        database.kysely,
        command.tribeSlug
      );

      if (!targetTribe) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
      }

      const canManageSubscriptionPrices =
        await this.canManageTribeSubscriptionPrices(
          database.kysely,
          targetTribe.id
        );

      if (!canManageSubscriptionPrices) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
      }

      const upsertedIntegration = await database.kysely
        .insertInto("tribe_payment_integrations")
        .values((expressionBuilder) => ({
          access_token: command.accessToken,
          connected_by: expressionBuilder.fn<string>("public.current_app_user_id"),
          created_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
          provider: MERCADO_PAGO_PAYMENT_PROVIDER,
          provider_account_id: command.providerAccountId,
          refresh_token: command.refreshToken,
          token_expires_at: createTokenExpirationDate(command.expiresIn),
          tribe_id: targetTribe.id,
          updated_at: expressionBuilder.fn<Date>("timezone", [
            expressionBuilder.val("utc"),
            expressionBuilder.fn<Date>("now"),
          ]),
        }))
        .onConflict((conflictBuilder) =>
          conflictBuilder.columns(["tribe_id", "provider"]).doUpdateSet(
            (expressionBuilder) => ({
              access_token: expressionBuilder.ref("excluded.access_token"),
              connected_by: expressionBuilder.ref("excluded.connected_by"),
              provider_account_id: expressionBuilder.ref(
                "excluded.provider_account_id"
              ),
              refresh_token: expressionBuilder.ref("excluded.refresh_token"),
              token_expires_at: expressionBuilder.ref("excluded.token_expires_at"),
              updated_at: expressionBuilder.fn<Date>("timezone", [
                expressionBuilder.val("utc"),
                expressionBuilder.fn<Date>("now"),
              ]),
            })
          )
        )
        .returning("id")
        .executeTakeFirst();

      return {
        status: upsertedIntegration
          ? TRIBE_SUBSCRIPTION_PRICE_STATUS.connected
          : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
      };
    });
  }

  private async findTargetTribe(
    database: RequestDatabase["kysely"],
    tribeSlug: string
  ): Promise<TargetTribeRow | null> {
    return (
      (await database
        .selectFrom("tribes")
        .select("id")
        .where("slug", "=", tribeSlug)
        .limit(1)
        .executeTakeFirst()) ?? null
    );
  }

  private async canManageTribeSubscriptionPrices(
    database: RequestDatabase["kysely"],
    tribeId: string
  ): Promise<boolean> {
    const permission = await database
      .selectNoFrom((expressionBuilder) => [
        expressionBuilder.fn<boolean>("public.can_manage_tribe_subscription_prices", [
          expressionBuilder.val(tribeId),
        ]).as("canManageSubscriptionPrices"),
      ])
      .executeTakeFirst();

    return permission?.canManageSubscriptionPrices === true;
  }
}
