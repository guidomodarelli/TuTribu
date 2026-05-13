import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import {
  getTribeRoundCacheTag,
  TRIBE_ROUND_SHARED_CACHE_LIFE,
} from "@/src/modules/messages/constants/tribe-round-cache";
import type { TribeRoundSharedDataResult } from "@/src/modules/messages/application/results/tribe-round-result";
import type { ListTribeRoundSharedDataQuery } from "@/src/modules/messages/domain/repositories/message-round-read-repository";
import { PostgresMessageRoundRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";
import { createServerDatabaseClient } from "@/src/modules/shared/infrastructure/database/server-database-client";

type RequestScopedDatabaseClient = Awaited<
  ReturnType<typeof createServerDatabaseClient>
>;

export async function listCachedTribeRoundSharedData({
  channelSlug,
  page,
  tribeSlug,
  viewerId,
}: ListTribeRoundSharedDataQuery): Promise<TribeRoundSharedDataResult> {
  "use cache";

  cacheLife(TRIBE_ROUND_SHARED_CACHE_LIFE);
  cacheTag(getTribeRoundCacheTag(tribeSlug));

  const databaseClient = await createServerDatabaseClient();
  const executeWithRequestContext = <T>(
    callback: Parameters<RequestScopedDatabaseClient["withRequestContext"]>[1]
  ) =>
    databaseClient.withRequestContext(
      {
        email: null,
        userId: viewerId,
      },
      callback
    ) as Promise<T>;
  const messageRoundReadRepository = new PostgresMessageRoundRepository(
    executeWithRequestContext
  );

  return messageRoundReadRepository.listSharedDataByTribeSlug({
    channelSlug,
    page,
    tribeSlug,
    viewerId,
  });
}
