/** Observes a real contact claimant blocked by physical account deletion. @module admission-account-deletion-contention */
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { RequestDatabaseContext } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { withAdmissionTransitionContention } from "./admission-transition-contention";

/**
 * Commits deletion only after PostgreSQL confirms the claimant is waiting for it.
 * @typeParam Result - Observable result of the actual admission operation.
 * @param database - Owned disposable branch with room for all three transactions.
 * @param context - Synthetic actor authorized to delete the test-owned account.
 * @param ownerUserId - Exact account whose contact reservation must survive.
 * @param claim - Actual binding or proof operation, with settlement retained immediately.
 * @returns The claimant's settled result after deletion and observation finish.
 * @throws When deletion, proven contention, or an owned transaction fails.
 */
export async function withAdmissionAccountDeletionContention<Result>(database: AcademyAdmissionTestDatabase, context: RequestDatabaseContext, ownerUserId: string, claim: () => Promise<Result>): Promise<PromiseSettledResult<Result>> {
  return withAdmissionTransitionContention(database, context, async (transaction) => {
    const removed = (await transaction.execute(sql`delete from public."user" where id=${ownerUserId} returning id`)).rows[0];
    if (!removed) throw new Error("Admission deletion contention failed: owned_account_unavailable");
  }, claim);
}
