/** Composes the native auth provider with private database, evidence and diagnostic adapters. @module better-auth */
import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { BETTER_AUTH_SESSION_OPTIONS } from "@/src/modules/auth/constants/session";
import { isMissingProviderAccountError } from "@/src/modules/auth/infrastructure/better-auth/provider-account-errors";
import { googleIdentityEvidencePlugin } from "@/src/modules/auth/infrastructure/better-auth/google-identity-evidence-plugin";
import { createBetterAuthLogger } from "./better-auth-logger";
import { createPrivateAuthDatabaseAdapter } from "./private-auth-database-adapter";
import { BETTER_AUTH_ENV, BETTER_AUTH_ERROR_MESSAGE, BETTER_AUTH_PROVIDER, GOOGLE_OFFLINE_ACCESS, BETTER_AUTH_DATABASE_POOL_OPERATION, BETTER_AUTH_SERVER_ONLY_HTTP_PATHS } from "../../constants/better-auth-config";
import { scheduleMemberProfileImageRefresh } from "@/src/modules/auth/infrastructure/composition/member-profile-image-refresh";
import { withDevSignIn } from "@/src/modules/auth/infrastructure/dev-sign-in/dev-sign-in-auth-options";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { getServerDatabaseEnvironment } from "@/src/modules/shared/infrastructure/database/server-environment";
import {
  accounts,
  sessions,
  users,
  verifications,
} from "@/src/modules/shared/infrastructure/database/schema";

const BETTER_AUTH_SCHEMA = {
  account: accounts,
  session: sessions,
  user: users,
  verification: verifications,
} as const;

type GlobalBetterAuthDatabase = typeof globalThis & {
  __tuTribuBetterAuthPool?: Pool;
};

function getBetterAuthPool() {
  const globalDatabase = globalThis as GlobalBetterAuthDatabase;

  if (!globalDatabase.__tuTribuBetterAuthPool) {
    const { connectionString } = getServerDatabaseEnvironment();
    globalDatabase.__tuTribuBetterAuthPool = createPostgresPool({
      connectionString,
      operation: BETTER_AUTH_DATABASE_POOL_OPERATION.idleError,
    });
  }

  return globalDatabase.__tuTribuBetterAuthPool;
}

function getBetterAuthEnvironment() {
  const secret = process.env[BETTER_AUTH_ENV.secret];
  const url = process.env[BETTER_AUTH_ENV.url];
  const googleClientId = process.env[BETTER_AUTH_ENV.googleClientId];
  const googleClientSecret = process.env[BETTER_AUTH_ENV.googleClientSecret];

  if (!secret || !url) {
    throw new Error(BETTER_AUTH_ERROR_MESSAGE.secret);
  }

  if (!googleClientId || !googleClientSecret) {
    throw new Error(BETTER_AUTH_ERROR_MESSAGE.googleProvider);
  }

  return {
    googleClientId,
    googleClientSecret,
    secret,
    url,
  };
}

const betterAuthEnvironment = getBetterAuthEnvironment();
const database = drizzle(getBetterAuthPool(), {
  schema: BETTER_AUTH_SCHEMA,
});

/**
 * Application auth instance. `withDevSignIn` adds the email and password
 * sign-in only on `next dev` with `DEV_SIGN_IN` set; see
 * `docs/conventions/dev-sign-in.htm`.
 */
export const auth = betterAuth(withDevSignIn({
  logger: createBetterAuthLogger(),
  disabledPaths: [...BETTER_AUTH_SERVER_ONLY_HTTP_PATHS],
  baseURL: betterAuthEnvironment.url,
  database: createPrivateAuthDatabaseAdapter(drizzleAdapter(database, {
    provider: BETTER_AUTH_PROVIDER.database,
    schema: BETTER_AUTH_SCHEMA,
  })),
  databaseHooks: {
    session: {
      update: {
        after: async (session) => {
          scheduleMemberProfileImageRefresh(
            session.userId,
            getGoogleAccessTokenForMember
          );
        },
      },
    },
  },
  plugins: [googleIdentityEvidencePlugin(),nextCookies()],
  secret: betterAuthEnvironment.secret,
  /**
   * Sliding 180-day session. Server renders read it without refreshing (they
   * cannot write cookies), so the renewal reaches the browser through the
   * `/api/auth/get-session` keep-alive issued by the platform client.
   */
  session: BETTER_AUTH_SESSION_OPTIONS,
  socialProviders: {
    [BETTER_AUTH_PROVIDER.google]: {
      accessType: GOOGLE_OFFLINE_ACCESS.accessType,
      clientId: betterAuthEnvironment.googleClientId,
      clientSecret: betterAuthEnvironment.googleClientSecret,
      overrideUserInfoOnSignIn: true,
      prompt: GOOGLE_OFFLINE_ACCESS.prompt,
    },
  },
}, process.env));

/**
 * Resolves a fresh Google access token for a member using the stored offline
 * credentials. Returns `null` when no access token is available, including a
 * member without a linked Google account (the development email sign-in
 * member), so the background refresh is skipped. Other operational failures
 * still reach the refresh use case and are logged.
 *
 * @param userId - Identifier of the member whose access token is requested.
 * @returns A valid access token, or `null` when none is available.
 */
async function getGoogleAccessTokenForMember(
  userId: string
): Promise<string | null> {
  try {
    // Better Auth types the refreshed token as always present, but it comes from
    // the provider's stored credentials, so a missing token is still possible.
    const tokens = (await auth.api.getAccessToken({
      body: { providerId: BETTER_AUTH_PROVIDER.google, userId },
    })) as { accessToken?: string | null } | null | undefined;

    return tokens?.accessToken ?? null;
  } catch (error) {
    // A member without a Google account has no picture to refresh: skip it.
    if (isMissingProviderAccountError(error)) {
      return null;
    }

    throw error;
  }
}
