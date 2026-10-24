/** Applies legacy free entry without bypassing protected admission or moderation. @module postgres-tribe-free-join-repository */
import { sql } from "drizzle-orm";

import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import {
  TRIBE_FREE_JOIN_STATUS,
  TRIBE_MEMBER_FREE_OPEN_JOIN_SOURCE,
} from "@/src/modules/tribes/constants/tribe-story";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";
import { lockLegacyTribeEntry } from "./legacy-tribe-entry-lock";
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
  member_readable: boolean | null;
};

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

/** Preserves readable instances and restores only known commercial basic membership. */
export class PostgresTribeFreeJoinRepository implements TribeFreeJoinRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  /**
   * Evaluates the current free-entry scope after serializing tenant and membership writers.
   * @param command - Canonical tribe slug belonging to the caller's authenticated context.
   * @returns A stable joined/already-member/forbidden outcome without altering roles or joining dates.
   */
  async join({ tribeSlug }: JoinTribeFreeCommand): Promise<TribeFreeJoinResult> {
    return this.executeWithDatabase(async (database) => {
      await lockLegacyTribeEntry(database,tribeSlug);
      const result = await database.execute(sql`
        with target_tribe as (
          select tribe.id from public.tribes tribe
          where tribe.id=public.tribe_free_open_join_id_by_slug(${tribeSlug})
            and tribe.admissions_control_activated_at is null
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
            ${TRIBE_MEMBERSHIP_STATUS_REASON.none},
            ${TRIBE_MEMBER_FREE_OPEN_JOIN_SOURCE},
            timezone('utc', now())
          from target_tribe
          where target_tribe.id is not null
            and public.current_app_user_id() <> ''
          on conflict (tribe_id, user_id) do nothing
          returning tribe_members.id
        )
        select
          (select id from target_tribe) is not null as tribe_available,
          exists(select 1 from public.tribe_members member where member.tribe_id=(select id from target_tribe) and member.user_id=public.current_app_user_id() and member.status in (${TRIBE_MEMBERSHIP_STATUS.active},${TRIBE_MEMBERSHIP_STATUS.muted})) as member_readable,
          exists (select 1 from inserted_membership) as joined
      `);
      const row = (result.rows?.[0] ?? null) as FreeJoinRow | null;

      if (row?.joined) {
        return { status: TRIBE_FREE_JOIN_STATUS.joined };
      }

      if (row?.tribe_available) {
        // Only an observed commercial basic state is recoverable; role and date belong to the instance.
        const reactivation = await database.execute(sql`
          update public.tribe_members
          set
            status = tribe_members.commercial_recovery_status,
            status_reason = ${TRIBE_MEMBERSHIP_STATUS_REASON.none},
            joined_via = ${TRIBE_MEMBER_FREE_OPEN_JOIN_SOURCE}
          where tribe_members.tribe_id = public.tribe_free_open_join_id_by_slug(${tribeSlug})
            and tribe_members.user_id = public.current_app_user_id()
            and tribe_members.role=${TRIBE_MEMBER_ROLE.tribemate}
            and tribe_members.commercial_recovery_status in (${TRIBE_MEMBERSHIP_STATUS.active},${TRIBE_MEMBERSHIP_STATUS.muted})
            and ((tribe_members.status=${TRIBE_MEMBERSHIP_STATUS.removed} and tribe_members.status_reason=${TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive})
              or (tribe_members.status=${TRIBE_MEMBERSHIP_STATUS.blocked} and tribe_members.status_reason=${TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked}))
          returning tribe_members.id
        `);

        if ((reactivation.rows ?? []).length > 0) {
          return { status: TRIBE_FREE_JOIN_STATUS.joined };
        }

        return { status: row.member_readable ? TRIBE_FREE_JOIN_STATUS.alreadyMember : TRIBE_FREE_JOIN_STATUS.forbidden };
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
