import { sql } from "drizzle-orm";

import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import {
  TRIBE_FREE_JOIN_STATUS,
  TRIBE_MEMBER_FREE_OPEN_JOIN_SOURCE,
} from "@/src/modules/tribes/constants/tribe-story";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type {
  JoinTribeFreeCommand,
  TribeFreeJoinRepository,
  TribeFreeJoinResult,
} from "@/src/modules/tribes/domain/repositories/tribe-free-join-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type FreeJoinRow = {
  joined: boolean | null;
  tribe_available: boolean | null;
};

const MEMBERSHIP_STATUS_REASON_NONE = "none";

const POSTGRES_ERROR_CODE = {
  insufficientPrivilege: "42501",
  undefinedFunction: "42883",
} as const;

function readPostgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const postgresError = error as { cause?: unknown; code?: string };

  if (postgresError.code) {
    return postgresError.code;
  }

  return postgresError.cause &&
    typeof postgresError.cause === "object" &&
    "code" in postgresError.cause
    ? (postgresError.cause as { code?: string }).code
    : undefined;
}

export class PostgresTribeFreeJoinRepository implements TribeFreeJoinRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async join({ tribeSlug }: JoinTribeFreeCommand): Promise<TribeFreeJoinResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select public.tribe_free_open_join_id_by_slug(${tribeSlug}) as id
        ),
        inserted_membership as (
          insert into public.tribe_members (
            tribe_id,
            user_id,
            role,
            status,
            status_reason,
            joined_via,
            created_at
          )
          select
            target_tribe.id,
            public.current_app_user_id(),
            ${TRIBE_MEMBER_ROLE.tribemate},
            ${TRIBE_MEMBERSHIP_STATUS.active},
            ${MEMBERSHIP_STATUS_REASON_NONE},
            ${TRIBE_MEMBER_FREE_OPEN_JOIN_SOURCE},
            timezone('utc', now())
          from target_tribe
          where target_tribe.id is not null
          on conflict (tribe_id, user_id) do nothing
          returning tribe_members.id
        )
        select
          (select id from target_tribe) is not null as tribe_available,
          exists (select 1 from inserted_membership) as joined
      `);
      const row = (result.rows?.[0] ?? null) as FreeJoinRow | null;

      if (row?.joined) {
        return { status: TRIBE_FREE_JOIN_STATUS.joined };
      }

      if (row?.tribe_available) {
        return { status: TRIBE_FREE_JOIN_STATUS.alreadyMember };
      }

      return { status: TRIBE_FREE_JOIN_STATUS.forbidden };
    }).catch((error: unknown) => {
      const errorCode = readPostgresErrorCode(error);

      if (
        errorCode === POSTGRES_ERROR_CODE.insufficientPrivilege ||
        errorCode === POSTGRES_ERROR_CODE.undefinedFunction
      ) {
        return { status: TRIBE_FREE_JOIN_STATUS.forbidden };
      }

      throw error;
    });
  }
}
