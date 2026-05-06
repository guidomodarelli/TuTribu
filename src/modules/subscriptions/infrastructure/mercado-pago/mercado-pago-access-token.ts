/**
 * Resolves fresh Mercado Pago access tokens for persisted tribe integrations.
 *
 * @module mercado-pago-access-token
 */

import { sql } from "drizzle-orm";

import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MercadoPagoOAuthTokenResult } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";

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
  if (!input.storedToken.accessToken) {
    return null;
  }

  if (isMercadoPagoAccessTokenFresh(input.storedToken.tokenExpiresAt)) {
    return input.storedToken.accessToken;
  }

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
 * Determines whether a token is usable beyond the refresh safety window.
 *
 * @param tokenExpiresAt - Persisted provider expiration timestamp.
 * @returns Whether the stored token should be used without refreshing.
 */
function isMercadoPagoAccessTokenFresh(tokenExpiresAt: Date | string | null): boolean {
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
    await database.execute(sql`
      update public.tribe_payment_integrations
      set
        access_token = ${input.refreshedToken.accessToken},
        provider_account_id = coalesce(
          ${input.refreshedToken.providerAccountId},
          provider_account_id
        ),
        refresh_token = coalesce(
          ${input.refreshedToken.refreshToken ?? input.storedRefreshToken},
          refresh_token
        ),
        token_expires_at = case
          when ${input.refreshedToken.expiresIn}::integer is null then token_expires_at
          else timezone('utc', now()) + (${input.refreshedToken.expiresIn}::integer || ' seconds')::interval
        end,
        updated_at = timezone('utc', now())
      where tribe_id = ${input.tribeId}
        and provider = 'mercado_pago'
    `);
  });
}
