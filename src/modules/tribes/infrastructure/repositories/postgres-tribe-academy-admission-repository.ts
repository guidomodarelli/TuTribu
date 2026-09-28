/**
 * Postgres adapter of the basic academy admission.
 *
 * Rules (the runtime role bypasses RLS, so they are repeated here):
 * - the tribe must run in academy mode with admissions enabled
 *   (`tribe_academy_admission_id_by_slug`, which also rejects conduct blocks);
 * - a new member enters as `tribemate` / `active` without any grant;
 * - concurrent joins collapse on `tribe_members (tribe_id, user_id)`;
 * - an existing row is only recovered when its previous state was an
 *   exclusively commercial one (`removed/subscription_inactive` or
 *   `blocked/payment_blocked`); conduct blocks and other removals stay.
 *
 * @module postgres-tribe-academy-admission-repository
 */

import { sql } from "drizzle-orm";

import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_MEMBERSHIP_STATUS_REASON,
} from "@/src/modules/tribes/constants/tribe-page-access";
import { TRIBE_MEMBER_ACADEMY_ADMISSION_SOURCE } from "@/src/modules/tribes/constants/tribe-story";
import type {
  JoinTribeAcademyAdmissionCommand,
  TribeAcademyAdmissionRepository,
  TribeAcademyAdmissionStatus,
} from "@/src/modules/tribes/domain/repositories/tribe-academy-admission-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

export class PostgresTribeAcademyAdmissionRepository
  implements TribeAcademyAdmissionRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async join({
    tribeSlug,
  }: JoinTribeAcademyAdmissionCommand): Promise<{ status: TribeAcademyAdmissionStatus }> {
    return this.executeWithDatabase(async (database) => {
      const tribeResult = await database.execute(sql`
        select public.tribe_academy_admission_id_by_slug(${tribeSlug}) as tribe_id
      `);
      const tribeId =
        (tribeResult.rows?.[0] as { tribe_id: string | null } | undefined)?.tribe_id ?? null;

      if (!tribeId) {
        const blockedResult = await database.execute(sql`
          select exists (
            select 1
            from public.tribe_members
            inner join public.tribes on tribes.id = tribe_members.tribe_id
            where tribes.slug = ${tribeSlug}
              and tribe_members.user_id = public.current_app_user_id()
              and tribe_members.status = ${TRIBE_MEMBERSHIP_STATUS.blocked}
              and tribe_members.status_reason = ${TRIBE_MEMBERSHIP_STATUS_REASON.conductBlocked}
          ) as is_blocked
        `);

        return {
          status: (blockedResult.rows?.[0] as { is_blocked: boolean }).is_blocked
            ? "blocked"
            : "admission_closed",
        };
      }

      const inserted = await database.execute(sql`
        insert into public.tribe_members (
          tribe_id, user_id, role, status, status_reason, joined_via, created_at
        )
        values (
          ${tribeId},
          public.current_app_user_id(),
          ${TRIBE_MEMBER_ROLE.tribemate},
          ${TRIBE_MEMBERSHIP_STATUS.active},
          ${TRIBE_MEMBERSHIP_STATUS_REASON.none},
          ${TRIBE_MEMBER_ACADEMY_ADMISSION_SOURCE},
          timezone('utc', now())
        )
        on conflict (tribe_id, user_id) do nothing
        returning id
      `);

      if ((inserted.rows ?? []).length > 0) {
        return { status: "joined" };
      }

      // Existing row (possibly committed by a concurrent join): a new
      // statement sees it. Only commercial blocks are recovered, keeping role.
      const recovered = await database.execute(sql`
        update public.tribe_members
        set
          status = ${TRIBE_MEMBERSHIP_STATUS.active},
          status_reason = ${TRIBE_MEMBERSHIP_STATUS_REASON.none}
        where tribe_members.tribe_id = ${tribeId}
          and tribe_members.user_id = public.current_app_user_id()
          and (
            (
              tribe_members.status = ${TRIBE_MEMBERSHIP_STATUS.removed}
              and tribe_members.status_reason = ${TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive}
            )
            or (
              tribe_members.status = ${TRIBE_MEMBERSHIP_STATUS.blocked}
              and tribe_members.status_reason = ${TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked}
            )
          )
        returning id
      `);

      if ((recovered.rows ?? []).length > 0) {
        return { status: "joined" };
      }

      const existing = await database.execute(sql`
        select status
        from public.tribe_members
        where tribe_members.tribe_id = ${tribeId}
          and tribe_members.user_id = public.current_app_user_id()
      `);
      const status = (existing.rows?.[0] as { status: string } | undefined)?.status;

      return {
        status:
          status === TRIBE_MEMBERSHIP_STATUS.active || status === TRIBE_MEMBERSHIP_STATUS.muted
            ? "already_member"
            : "blocked",
      };
    });
  }
}
