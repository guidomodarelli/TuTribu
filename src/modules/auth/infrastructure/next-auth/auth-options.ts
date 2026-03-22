import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { getGoogleOAuthServerConfig } from "../oauth/google-oauth-config";
import {
  buildGoogleSessionToken,
  hasExpiredGoogleAccessToken,
  refreshGoogleSessionToken,
  type GoogleSessionToken,
} from "../oauth/google-oauth-token";

const googleOAuthServerConfig = getGoogleOAuthServerConfig();

const googleProvider = googleOAuthServerConfig
  ? GoogleProvider({
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
          scope: googleOAuthServerConfig.scopeString,
        },
      },
      clientId: googleOAuthServerConfig.clientId,
      clientSecret: googleOAuthServerConfig.clientSecret,
    })
  : null;

export const authOptions: NextAuthOptions = {
  callbacks: {
    async jwt({ account, token }) {
      if (account?.provider === "google") {
        return buildGoogleSessionToken({ account, token });
      }

      const googleSessionToken = token as GoogleSessionToken;

      if (
        !googleSessionToken.googleAccessToken ||
        !googleSessionToken.googleAccessTokenExpiresAt
      ) {
        return token;
      }

      if (!hasExpiredGoogleAccessToken(googleSessionToken)) {
        return token;
      }

      try {
        return await refreshGoogleSessionToken(googleSessionToken);
      } catch {
        return {
          ...googleSessionToken,
          googleTokenError: "RefreshGoogleAccessTokenError",
        };
      }
    },
  },
  pages: {
    error: "/auth/error",
    signIn: "/auth/signin",
  },
  providers: googleProvider ? [googleProvider] : [],
  secret: googleOAuthServerConfig?.nextAuthSecret,
  session: {
    strategy: "jwt",
  },
};
