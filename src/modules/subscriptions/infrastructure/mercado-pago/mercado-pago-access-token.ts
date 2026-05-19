/**
 * Resolves fresh Mercado Pago access tokens for persisted tribe integrations.
 *
 * @module mercado-pago-access-token
 */

import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MercadoPagoOAuthTokenResult } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import { sql } from "kysely";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

export type MercadoPagoAccessTokenRefresher = (
  refreshToken: string
) => Promise<MercadoPagoOAuthTokenResult>;

export type StoredMercadoPagoAccessToken = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | string | null;
  tribeId: string | null;
};

const MERCADO_PAGO_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const MERCADO_PAGO_TOKEN_REFRESH_CONTEXT = {
  checkoutTribeSettingName: "app.subscription_checkout_tribe_id",
  provider: "mercado_pago",
} as const;

/**
 * Refreshes and persists a stored Mercado Pago access token.
 *
 * @param input - Stored token data and token refresh dependencies.
 * @returns Fresh access token or null when no refresh token can be used.
 */
export async function refreshStoredMercadoPagoAccessToken(input: {
  executeWithDatabase: DatabaseExecutor;
  refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher;
  storedToken: StoredMercadoPagoAccessToken;
}): Promise<string | null> {
  if (!input.storedToken.refreshToken || !input.storedToken.tribeId) {
    return null;
  }

  const refreshedToken = await input.refreshMercadoPagoAccessToken(
    input.storedToken.refreshToken
  );

  await persistMercadoPagoAccessToken({
    executeWithDatabase: input.executeWithDatabase,
    refreshedToken,
    storedRefreshToken: input.storedToken.refreshToken,
    tribeId: input.storedToken.tribeId,
  });

  return refreshedToken.accessToken;
}

/**
 * Resolves an access token, refreshing and persisting it when it is expired.
 *
 * @param input - Stored token data and token refresh dependencies.
 * @returns Fresh access token or null when no usable token can be resolved.
 */
export async function resolveMercadoPagoAccessToken(input: {
  executeWithDatabase: DatabaseExecutor;
  refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher;
  storedToken: StoredMercadoPagoAccessToken;
}): Promise<string | null> {
  if (!input.storedToken.accessToken && !input.storedToken.refreshToken) {
    return null;
  }

  if (
    input.storedToken.accessToken &&
    isMercadoPagoAccessTokenFresh(input.storedToken.tokenExpiresAt)
  ) {
    return input.storedToken.accessToken;
  }

  return refreshStoredMercadoPagoAccessToken({
    executeWithDatabase: input.executeWithDatabase,
    refreshMercadoPagoAccessToken: input.refreshMercadoPagoAccessToken,
    storedToken: input.storedToken,
  });
}

/**
 * Determines whether a token is usable beyond the refresh safety window.
 *
 * @param tokenExpiresAt - Persisted provider expiration timestamp.
 * @returns Whether the stored token should be used without refreshing.
 */
export function isMercadoPagoAccessTokenFresh(tokenExpiresAt: Date | string | null): boolean {
  if (!tokenExpiresAt) {
    return true;
  }

  const expirationTime = new Date(tokenExpiresAt).getTime();

  return (
    Number.isFinite(expirationTime) &&
    expirationTime - Date.now() > MERCADO_PAGO_TOKEN_REFRESH_WINDOW_MS
  );
}

/**
 * Persists refreshed token data for the tribe Mercado Pago integration.
 *
 * @param input - Refreshed token data and persistence dependencies.
 * @returns Promise resolved after persistence.
 */
async function persistMercadoPagoAccessToken(input: {
  executeWithDatabase: DatabaseExecutor;
  refreshedToken: MercadoPagoOAuthTokenResult;
  storedRefreshToken: string;
  tribeId: string;
}): Promise<void> {
  await input.executeWithDatabase(async (database) => {
    await database.kysely
      .selectNoFrom((expressionBuilder) =>
        expressionBuilder
          .fn("set_config", [
            expressionBuilder.val(
              MERCADO_PAGO_TOKEN_REFRESH_CONTEXT.checkoutTribeSettingName
            ),
            expressionBuilder.val(input.tribeId),
            expressionBuilder.val(true),
          ])
          .as("token_refresh_context")
      )
      .executeTakeFirst();

    await database.kysely
      .updateTable("tribe_payment_integrations")
      .set((expressionBuilder) => ({
        access_token: input.refreshedToken.accessToken,
        provider_account_id: expressionBuilder.fn.coalesce(
          expressionBuilder.val(input.refreshedToken.providerAccountId),
          expressionBuilder.ref("provider_account_id")
        ),
        refresh_token: expressionBuilder.fn.coalesce(
          expressionBuilder.val(
            input.refreshedToken.refreshToken ?? input.storedRefreshToken
          ),
          expressionBuilder.ref("refresh_token")
        ),
        token_expires_at:
          input.refreshedToken.expiresIn === null
            ? expressionBuilder.ref("token_expires_at")
            : sql<Date>`timezone('utc', now()) + (${input.refreshedToken.expiresIn} * interval '1 second')`,
        updated_at: expressionBuilder.fn<Date>("timezone", [
          expressionBuilder.val("utc"),
          expressionBuilder.fn<Date>("now"),
        ]),
      }))
      .where("tribe_id", "=", input.tribeId)
      .where("provider", "=", MERCADO_PAGO_TOKEN_REFRESH_CONTEXT.provider)
      .execute();
  });
}
