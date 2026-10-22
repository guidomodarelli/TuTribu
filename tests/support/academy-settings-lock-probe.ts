/** Observes on real PostgreSQL whether another transaction holds a tribe's academy settings row, without replacing any collaborator. @module academy-settings-lock-probe */
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { prepareAdmissionLeader } from "./admission-leader-fixture";
import { readPostgresTestDiagnostics } from "./postgres-test-diagnostics";
import { GUARD_LOCK_ORDER_VALIDATION } from "./constants/guard-lock-order";

type Leader = Awaited<ReturnType<typeof prepareAdmissionLeader>>;

/**
 * @param database - Owned branch. @param leader - Seeded leader.
 * @returns Whether another open transaction holds the settings row: a `FOR UPDATE NOWAIT` probe conflicts with its `FOR SHARE`, and takes and releases a free row.
 */
export async function isAcademySettingsLocked(database: AcademyAdmissionTestDatabase, leader: Leader): Promise<boolean> {
  return database.withContext(leader.fixture.own, async (transaction) => { await transaction.execute(sql`select tribe_id from public.tribe_academy_settings where tribe_id=${leader.tribeId} for update nowait`); return false; })
    .catch((error: unknown) => { if (readPostgresTestDiagnostics(error).sqlStates.includes(GUARD_LOCK_ORDER_VALIDATION.lockNotAvailableCode)) return true; throw error; });
}
