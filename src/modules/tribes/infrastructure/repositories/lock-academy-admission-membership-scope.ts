/** Coordinates admission scope locks through the existing authoritative transaction. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ACADEMY_ADMISSION_APPLICANT_LOCK_DOMAIN } from "../../constants/academy-membership";

/**
 * Retains a shared tenant fence and an exclusive applicant lock for self admission.
 * Other actors retain the exclusive tenant fence used by administrative membership effects.
 * @param database - Existing guarded transaction; authority is verified by its owning use case.
 * @param tribeId - Exact tenant scope selected by the owner.
 * @param applicantUserId - Beneficiary identity, compared with the native SQL actor.
 * @returns Whether a tenant fence was acquired under a nonempty SQL actor, without granting business permission.
 * @remarks Call before reading mutable applicant facts; the following SQL statement gets a fresh snapshot after waits.
 */
export async function lockAcademyAdmissionMembershipScope(database: RequestDatabase, tribeId: string, applicantUserId: string): Promise<boolean> {
  const result = await database.execute<{ locked: boolean }>(sql`
    with actor_identity as materialized (
      select public.current_app_user_id() as actor_id
    ), own_tribe as materialized (
      select tribe.id from public.tribes tribe cross join actor_identity actor
      where tribe.id=${tribeId} and actor.actor_id=${applicantUserId} for share of tribe
    ), managed_tribe as materialized (
      select tribe.id from public.tribes tribe cross join actor_identity actor
      where tribe.id=${tribeId} and actor.actor_id is not null and actor.actor_id<>${applicantUserId} for update of tribe
    ), locked_tribe as materialized (
      select id from own_tribe union all select id from managed_tribe
    )
    select true as locked,case when actor.actor_id=${applicantUserId} then
      pg_advisory_xact_lock(hashtextextended(jsonb_build_array(${ACADEMY_ADMISSION_APPLICANT_LOCK_DOMAIN}::text,tribe.id,${applicantUserId}::text)::text,0))
    end as applicant_lock
    from locked_tribe tribe cross join actor_identity actor
  `);
  return result.rows[0]?.locked ?? false;
}
