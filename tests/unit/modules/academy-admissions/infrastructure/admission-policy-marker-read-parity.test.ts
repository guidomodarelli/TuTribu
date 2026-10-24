/** @vitest-environment node */
/** Pins on real PostgreSQL the stored policy and protection marker the leader's policy commands and query read, and the policy lock each one keeps, so the reads can be combined without changing their result. @module admission-policy-marker-read-parity-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { GuardScenarioRollback } from "@/tests/support/guard-lock-order";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";
import { readAdmissionControlMarker, readAdmissionPolicy, readAdmissionPolicyWithControlMarker } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-storage";
import type { AdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { GUARD_LOCK_ORDER_VALIDATION } from "@/tests/support/constants/guard-lock-order";
import { ADMISSION_POLICY_MARKER_READ_PARITY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-policy-marker-read-parity";

/** What a read returns plus which probes another transaction cannot take on the policy row afterwards. */
type PolicyMarkerFacts = { policy: AdmissionPolicy | null; marker: Date | null; blocksShare: boolean; blocksUpdate: boolean };
/** A way of reading the policy and marker inside the scenario's transaction. */
type PolicyMarkerRead = (transaction: RequestDatabase, tribeId: string, mutation: boolean) => Promise<{ policy: AdmissionPolicy | null; marker: Date | null }>;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission policy and marker read parity", () => {
  it("should read the same policy and marker and keep the same policy lock as the separate reads", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs });
      /** @param probe - Locking clause another transaction tries without waiting. @returns Whether the policy row is held against it. */
      const blocks = (probe: "for share nowait" | "for update nowait") => database.withContext(leader.fixture.own, async (transaction) => { await transaction.execute(sql`select tribe_id from public.academy_admission_policies where tribe_id=${leader.tribeId} ${sql.raw(probe)}`); return false; })
        .catch((error: unknown) => { if (readPostgresTestDiagnostics(error).sqlStates.includes(GUARD_LOCK_ORDER_VALIDATION.lockNotAvailableCode)) return true; throw error; });
      /** @param read - Reads under comparison. @param mutation - Whether a command reads. @param prepare - Rows visible only to this rolled-back scenario. @returns The facts it observed. */
      const observe = async (read: PolicyMarkerRead, mutation: boolean, prepare?: (transaction: RequestDatabase) => Promise<unknown>): Promise<PolicyMarkerFacts> => {
        let facts: PolicyMarkerFacts | undefined;
        await database.withContext(leader.fixture.own, async (transaction) => {
          await prepare?.(transaction);
          facts = { ...await read(transaction, leader.tribeId, mutation), blocksShare: await blocks("for share nowait"), blocksUpdate: await blocks("for update nowait") };
          throw new GuardScenarioRollback();
        }).catch((error: unknown) => { if (!(error instanceof GuardScenarioRollback)) throw error; });
        return facts!;
      };
      const separate: PolicyMarkerRead = async (transaction, tribeId, mutation) => ({ policy: await readAdmissionPolicy(transaction, tribeId, mutation), marker: await readAdmissionControlMarker(transaction, tribeId) });
      const scenarios: [string, boolean, ((transaction: RequestDatabase) => Promise<unknown>) | undefined][] = [
        ["absent_query", false, undefined],
        ["absent_command", true, undefined],
        // A committed policy, so the other transaction's probes can see the row and test its lock.
        ["stored_query", false, undefined],
        ["stored_command", true, undefined],
        ["marked_command", true, async (transaction) => {
          await transaction.execute(sql`alter table public.tribes disable trigger admission_control_marker_guard`);
          await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${VALIDATION.markerAt} where id=${leader.tribeId}`);
        }],
      ];
      const combined: Record<string, PolicyMarkerFacts> = {}, reference: Record<string, PolicyMarkerFacts> = {};
      for (const [name, mutation, prepare] of scenarios) {
        if (name === "stored_query") await database.withContext(leader.fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,changed_by_user_id,updated_at) values (${leader.tribeId},${leader.fixture.userId},now())`));
        reference[name] = await observe(separate, mutation, prepare);
        combined[name] = await observe(readAdmissionPolicyWithControlMarker, mutation, prepare);
      }
      expect(combined).toEqual(reference);
      expect(Object.fromEntries(Object.entries(combined).map(([name, facts]) => [name, { stored: facts.policy?.tribeId === leader.tribeId, version: facts.policy?.version ?? null, marker: facts.marker?.toISOString() ?? null, blocksShare: facts.blocksShare, blocksUpdate: facts.blocksUpdate }]))).toEqual({
        absent_query: { stored: false, version: null, marker: null, blocksShare: false, blocksUpdate: false },
        absent_command: { stored: false, version: null, marker: null, blocksShare: false, blocksUpdate: false },
        stored_query: { stored: true, version: 1, marker: null, blocksShare: false, blocksUpdate: true },
        stored_command: { stored: true, version: 1, marker: null, blocksShare: true, blocksUpdate: true },
        marked_command: { stored: true, version: 1, marker: VALIDATION.markerAt.toISOString(), blocksShare: true, blocksUpdate: true },
      });
    });
  }, VALIDATION.timeoutMs);
});
