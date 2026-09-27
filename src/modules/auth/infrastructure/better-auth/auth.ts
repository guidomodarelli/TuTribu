import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { BETTER_AUTH_SESSION_OPTIONS } from "@/src/modules/auth/constants/session";
import { scheduleMemberProfileImageRefresh } from "@/src/modules/auth/infrastructure/composition/member-profile-image-refresh";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { getServerDatabaseEnvironment } from "@/src/modules/shared/infrastructure/database/server-environment";
import {
  accounts,
  sessions,
  users,
  verifications,
} from "@/src/modules/shared/infrastructure/database/schema";

const BETTER_AUTH_ENV = {
  googleClientId: "GOOGLE_CLIENT_ID",
  googleClientSecret: "GOOGLE_CLIENT_SECRET",
  secret: "BETTER_AUTH_SECRET",
  url: "BETTER_AUTH_URL",
} as const;

const BETTER_AUTH_ERROR_MESSAGE = {
  googleProvider:
    "Better Auth Google provider environment is incomplete. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  secret:
    "Better Auth environment is incomplete. Set BETTER_AUTH_SECRET and BETTER_AUTH_URL.",
} as const;

const BETTER_AUTH_PROVIDER = {
  database: "pg",
  google: "google",
} as const;

const GOOGLE_OFFLINE_ACCESS = {
  /** Requests a refresh token so the profile picture can be re-fetched later. */
  accessType: "offline",
  /** Forces the consent screen so a refresh token is issued on every sign-in. */
  prompt: "consent",
} as const;

const BETTER_AUTH_SCHEMA = {
  account: accounts,
  session: sessions,
  user: users,
  verification: verifications,
} as const;

const BETTER_AUTH_DATABASE_POOL_OPERATION = {
  idleError: "better_auth_database_pool_idle_error",
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

export const auth = betterAuth({
  baseURL: betterAuthEnvironment.url,
  database: drizzleAdapter(database, {
    provider: BETTER_AUTH_PROVIDER.database,
    schema: BETTER_AUTH_SCHEMA,
  }),
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
  plugins: [nextCookies()],
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
});

/**
 * Resolves a fresh Google access token for a member using the stored offline
 * credentials. Returns `null` only when Better Auth resolves successfully but no
 * access token is available, so operational failures still reach the background
 * refresh use case and are logged.
 *
 * @param userId - Identifier of the member whose access token is requested.
 * @returns A valid access token, or `null` when none is available.
 */
async function getGoogleAccessTokenForMember(
  userId: string
): Promise<string | null> {
  const tokens = await auth.api.getAccessToken({
    body: { providerId: BETTER_AUTH_PROVIDER.google, userId },
  });

  return tokens?.accessToken ?? null;
}
