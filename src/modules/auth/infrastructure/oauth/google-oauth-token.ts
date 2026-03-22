import type { Account } from "next-auth";
import type { JWT } from "next-auth/jwt";

import { getGoogleOAuthServerConfig } from "./google-oauth-config";

export type GoogleSessionToken = JWT & {
  googleAccessToken?: string;
  googleAccessTokenExpiresAt?: number;
  googleRefreshToken?: string;
  googleTokenError?: string;
};

type GoogleRefreshTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
};

function resolveGoogleExpiry(expiresAt?: number | null): number | undefined {
  if (!expiresAt) {
    return undefined;
  }

  return expiresAt * 1000;
}

export function buildGoogleSessionToken({
  account,
  token,
}: {
  account: Account;
  token: JWT;
}): GoogleSessionToken {
  return {
    ...token,
    googleAccessToken: account.access_token,
    googleAccessTokenExpiresAt: resolveGoogleExpiry(account.expires_at),
    googleRefreshToken: account.refresh_token,
  };
}

export function hasExpiredGoogleAccessToken(token: GoogleSessionToken): boolean {
  if (!token.googleAccessTokenExpiresAt) {
    return true;
  }

  return Date.now() >= token.googleAccessTokenExpiresAt;
}

export async function refreshGoogleSessionToken(
  token: GoogleSessionToken
): Promise<GoogleSessionToken> {
  const googleOAuthServerConfig = getGoogleOAuthServerConfig();

  if (!googleOAuthServerConfig) {
    throw new Error("Google OAuth server config is missing");
  }

  if (!token.googleRefreshToken) {
    throw new Error("Google refresh token is missing");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: googleOAuthServerConfig.clientId,
      client_secret: googleOAuthServerConfig.clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.googleRefreshToken,
    }),
    cache: "no-store",
  });

  const refreshedToken =
    (await response.json()) as GoogleRefreshTokenResponse;

  if (!response.ok || !refreshedToken.access_token || !refreshedToken.expires_in) {
    throw new Error("Failed to refresh Google access token");
  }

  return {
    ...token,
    googleAccessToken: refreshedToken.access_token,
    googleAccessTokenExpiresAt: Date.now() + refreshedToken.expires_in * 1000,
    googleRefreshToken: refreshedToken.refresh_token ?? token.googleRefreshToken,
    googleTokenError: undefined,
  };
}
