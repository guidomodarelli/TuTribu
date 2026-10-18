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
  const result = await database.execute<{ locked: boolean }>(sql`select public.lock_academy_admission_membership_scope(${tribeId},${applicantUserId},${ACADEMY_ADMISSION_APPLICANT_LOCK_DOMAIN}) as locked`);
  return result.rows[0]?.locked ?? false;
}
