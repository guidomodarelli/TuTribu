import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

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
  trustedOrigins: "BETTER_AUTH_TRUSTED_ORIGINS",
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
    globalDatabase.__tuTribuBetterAuthPool = new Pool({
      connectionString,
    });
  }

  return globalDatabase.__tuTribuBetterAuthPool;
}

function normalizeTrustedOrigin(rawOrigin: string | undefined) {
  const trimmedOrigin = rawOrigin?.trim();

  if (!trimmedOrigin) {
    return null;
  }

  const candidateOrigin = trimmedOrigin.includes("://")
    ? trimmedOrigin
    : `https://${trimmedOrigin}`;

  try {
    return new URL(candidateOrigin).origin;
  } catch {
    return null;
  }
}

function readTrustedOrigins() {
  const configuredTrustedOrigins =
    process.env[BETTER_AUTH_ENV.trustedOrigins]?.split(",") ?? [];
  const originCandidates = [
    process.env[BETTER_AUTH_ENV.url],
    ...configuredTrustedOrigins,
  ];

  return Array.from(
    new Set(
      originCandidates
        .map((originCandidate) => normalizeTrustedOrigin(originCandidate))
        .filter((origin): origin is string => Boolean(origin))
    )
  );
}

function readAllowedHosts(trustedOrigins: string[]) {
  return trustedOrigins
    .map((trustedOrigin) => new URL(trustedOrigin).host)
    .filter((host) => host.length > 0);
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

  const trustedOrigins = readTrustedOrigins();

  return {
    allowedHosts: readAllowedHosts(trustedOrigins),
    googleClientId,
    googleClientSecret,
    secret,
    trustedOrigins,
    url,
  };
}

const betterAuthEnvironment = getBetterAuthEnvironment();
const database = drizzle(getBetterAuthPool(), {
  schema: BETTER_AUTH_SCHEMA,
});

export const auth = betterAuth({
  baseURL: {
    allowedHosts: betterAuthEnvironment.allowedHosts,
    fallback: betterAuthEnvironment.url,
  },
  database: drizzleAdapter(database, {
    provider: BETTER_AUTH_PROVIDER.database,
    schema: BETTER_AUTH_SCHEMA,
  }),
  plugins: [nextCookies()],
  secret: betterAuthEnvironment.secret,
  socialProviders: {
    [BETTER_AUTH_PROVIDER.google]: {
      clientId: betterAuthEnvironment.googleClientId,
      clientSecret: betterAuthEnvironment.googleClientSecret,
      overrideUserInfoOnSignIn: true,
    },
  },
  trustedOrigins: betterAuthEnvironment.trustedOrigins,
});
