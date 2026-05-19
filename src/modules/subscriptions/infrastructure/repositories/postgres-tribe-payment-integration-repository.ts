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
        .columns([
          "access_token",
          "connected_by",
          "created_at",
          "provider",
          "provider_account_id",
          "refresh_token",
          "token_expires_at",
          "tribe_id",
          "updated_at",
        ])
        .expression(
          database.kysely
            .selectNoFrom((expressionBuilder) => [
              expressionBuilder.val(command.accessToken).as("access_token"),
              expressionBuilder
                .fn<string>("public.current_app_user_id")
                .as("connected_by"),
              expressionBuilder
                .fn<Date>("timezone", [
                  expressionBuilder.val("utc"),
                  expressionBuilder.fn<Date>("now"),
                ])
                .as("created_at"),
              expressionBuilder.val(MERCADO_PAGO_PAYMENT_PROVIDER).as("provider"),
              expressionBuilder
                .val(command.providerAccountId)
                .as("provider_account_id"),
              expressionBuilder.val(command.refreshToken).as("refresh_token"),
              expressionBuilder
                .val(createTokenExpirationDate(command.expiresIn))
                .as("token_expires_at"),
              expressionBuilder.val(targetTribe.id).as("tribe_id"),
              expressionBuilder
                .fn<Date>("timezone", [
                  expressionBuilder.val("utc"),
                  expressionBuilder.fn<Date>("now"),
                ])
                .as("updated_at"),
            ])
            .where((whereBuilder) =>
              whereBuilder.fn<boolean>("public.can_manage_tribe_subscription_prices", [
                whereBuilder.val(targetTribe.id),
              ])
            )
        )
        .onConflict((conflictBuilder) =>
          conflictBuilder
            .columns(["tribe_id", "provider"])
            .doUpdateSet((expressionBuilder) => ({
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
            }))
            .where((whereBuilder) =>
              whereBuilder.fn<boolean>("public.can_manage_tribe_subscription_prices", [
                "tribe_payment_integrations.tribe_id",
              ])
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
