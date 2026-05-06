import { buildAuthModule } from "./auth/setup";
import { BetterAuthSessionRepository } from "./auth/infrastructure/repositories/better-auth-session-repository";
import { buildTribesModule } from "./tribes/setup";
import { PostgresTribeCreationRepository } from "./tribes/infrastructure/repositories/postgres-tribe-creation-repository";
import { PostgresTribeCreatorWhitelistRepository } from "./tribes/infrastructure/repositories/postgres-tribe-creator-whitelist-repository";
import { PostgresTribeReadRepository } from "./tribes/infrastructure/repositories/postgres-tribe-read-repository";
import { PostgresPostFeedRepository } from "./posts/infrastructure/repositories/postgres-post-feed-repository";
import { PostgresPostCategoryRepository } from "./posts/infrastructure/repositories/postgres-post-category-repository";
import { PostgresPostMutationRepository } from "./posts/infrastructure/repositories/postgres-post-mutation-repository";
import { buildPostsModule } from "./posts/setup";
import { createServerDatabaseClient } from "./shared/infrastructure/database/server-database-client";

type RequestScopedDatabaseClient = Awaited<ReturnType<typeof createServerDatabaseClient>>;

export async function createRequestModules() {
  const databaseClient = await createServerDatabaseClient();
  const { getRequestAuthContext } = await import(
    "./auth/infrastructure/better-auth/server-auth-context"
  );
  const authContext = await getRequestAuthContext();
  const executeWithRequestContext = <T>(
    callback: Parameters<RequestScopedDatabaseClient["withRequestContext"]>[1]
  ) => databaseClient.withRequestContext(authContext, callback) as Promise<T>;

  return {
    auth: buildAuthModule({
      authSessionRepository: new BetterAuthSessionRepository(),
    }),
    tribes: buildTribesModule({
      tribeReadRepository: new PostgresTribeReadRepository(
        executeWithRequestContext
      ),
      tribeCreationRepository: new PostgresTribeCreationRepository(
        executeWithRequestContext
      ),
      tribeCreatorWhitelistRepository:
        new PostgresTribeCreatorWhitelistRepository(executeWithRequestContext),
    }),
    posts: buildPostsModule({
      postCategoryRepository: new PostgresPostCategoryRepository(
        executeWithRequestContext
      ),
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
