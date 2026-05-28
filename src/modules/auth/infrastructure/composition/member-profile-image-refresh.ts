import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { after } from "next/server";
import { Pool } from "pg";

import { refreshMemberProfileImage } from "@/src/modules/auth/application/use-cases/refresh-member-profile-image-use-case";
import { GoogleProfilePictureProvider } from "@/src/modules/auth/infrastructure/profile/google-profile-picture-provider";
import { PostgresMemberProfileRepository } from "@/src/modules/auth/infrastructure/repositories/postgres-member-profile-repository";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { getServerDatabaseEnvironment } from "@/src/modules/shared/infrastructure/database/server-environment";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/**
 * Resolves a usable Google access token for a member. Provided by the Better Auth
 * wiring, which owns the offline-credential handling.
 */
type GoogleAccessTokenResolver = (userId: string) => Promise<string | null>;

const PROFILE_REFRESH_POOL_OPERATION =
  "member_profile_image_refresh_pool_idle_error";

const PROFILE_REFRESH_LOGGER_CONTEXT = {
  feature: "auth",
  operation: "refresh_member_profile_image",
  requestId: "background",
} as const;

type GlobalProfileRefreshDatabase = typeof globalThis & {
  __tuTribuProfileRefreshPool?: Pool;
};

function getProfileRefreshPool(): Pool {
  const globalDatabase = globalThis as GlobalProfileRefreshDatabase;

  if (!globalDatabase.__tuTribuProfileRefreshPool) {
    const { connectionString } = getServerDatabaseEnvironment();
    globalDatabase.__tuTribuProfileRefreshPool = createPostgresPool({
      connectionString,
      operation: PROFILE_REFRESH_POOL_OPERATION,
    });
  }

  return globalDatabase.__tuTribuProfileRefreshPool;
}

/**
 * Runs a callback against a plain pooled connection, without any request-scoped
 * row-level-security context. The profile image lives in the authentication user
 * table, which Better Auth writes with this same database role.
 */
async function executeWithProfileDatabase<T>(
  callback: (database: RequestDatabase) => Promise<T>
): Promise<T> {
  const client = await getProfileRefreshPool().connect();

  try {
    return await callback(drizzle(client));
  } finally {
    client.release();
  }
}

/**
 * Schedules a background refresh of a member's profile image after the current
 * response, composing the use case with its Google and Postgres adapters.
 *
 * @param userId - Identifier of the member whose image should be refreshed.
 * @param getAccessToken - Resolver for a fresh Google access token.
 */
export function scheduleMemberProfileImageRefresh(
  userId: string,
  getAccessToken: GoogleAccessTokenResolver
): void {
  const refresh = refreshMemberProfileImage({
    externalProfilePictureProvider: new GoogleProfilePictureProvider({
      getAccessToken,
    }),
    logger: createServerLogger(PROFILE_REFRESH_LOGGER_CONTEXT),
    memberProfileRepository: new PostgresMemberProfileRepository(
      executeWithProfileDatabase
    ),
  });

  after(async () => {
    await refresh(userId);
  });
}
