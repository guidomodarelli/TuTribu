import { buildAuthModule } from "./auth/setup";
import { getRequestAuthContext } from "./auth/infrastructure/better-auth/server-auth-context";
import { BetterAuthSessionRepository } from "./auth/infrastructure/repositories/better-auth-session-repository";
import { buildCommunitiesModule } from "./communities/setup";
import { PostgresCommunityCreationRepository } from "./communities/infrastructure/repositories/postgres-community-creation-repository";
import { PostgresCommunityCreatorWhitelistRepository } from "./communities/infrastructure/repositories/postgres-community-creator-whitelist-repository";
import { PostgresCommunityReadRepository } from "./communities/infrastructure/repositories/postgres-community-read-repository";
import { PostgresPostFeedRepository } from "./posts/infrastructure/repositories/postgres-post-feed-repository";
import { PostgresPostMutationRepository } from "./posts/infrastructure/repositories/postgres-post-mutation-repository";
import { buildPostsModule } from "./posts/setup";
import { createServerDatabaseClient } from "./shared/infrastructure/database/server-database-client";

type RequestScopedDatabaseClient = Awaited<ReturnType<typeof createServerDatabaseClient>>;

export async function createRequestModules() {
  const databaseClient = await createServerDatabaseClient();
  const authContext = await getRequestAuthContext();
  const executeWithRequestContext = <T>(
    callback: Parameters<RequestScopedDatabaseClient["withRequestContext"]>[1]
  ) => databaseClient.withRequestContext(authContext, callback) as Promise<T>;

  return {
    auth: buildAuthModule({
      authSessionRepository: new BetterAuthSessionRepository(),
    }),
    communities: buildCommunitiesModule({
      communityReadRepository: new PostgresCommunityReadRepository(
        executeWithRequestContext
      ),
      communityCreationRepository: new PostgresCommunityCreationRepository(
        executeWithRequestContext
      ),
      communityCreatorWhitelistRepository:
        new PostgresCommunityCreatorWhitelistRepository(executeWithRequestContext),
    }),
    posts: buildPostsModule({
      postCommentRepository: new PostgresPostMutationRepository(
        executeWithRequestContext
      ),
      postCreationRepository: new PostgresPostMutationRepository(
        executeWithRequestContext
      ),
      postFeedReadRepository: new PostgresPostFeedRepository(executeWithRequestContext),
      postReactionRepository: new PostgresPostMutationRepository(
        executeWithRequestContext
      ),
    }),
  };
}
