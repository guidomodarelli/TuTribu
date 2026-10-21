/** @vitest-environment node */
/** Pins on real PostgreSQL the activation inventory the leader's preparation reads, including catalog changes that must close it, so its queries can change without changing its result. @module admission-activation-inventory-parity-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { GuardScenarioRollback } from "@/tests/support/guard-lock-order";
import { PostgresAdmissionActivationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activation-repository";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { AdmissionActivationInventory } from "@/src/modules/academy-admissions/domain/policies/admission-activation-preflight";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_ACTIVATION_INVENTORY_PARITY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-activation-inventory-parity";

/** Inventory facts compared across implementations; runtime readiness and the recovery lock come from owned ports. */
type InventoryFacts = Omit<AdmissionActivationInventory, "tribeId">;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission activation inventory parity", () => {
  it("should read the same activation inventory and close it for every catalog change it inspects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs });
      const context: AuthorizedAdmissionContext = { userId: leader.fixture.userId, sessionId: leader.sessionId, tribeId: leader.tribeId, requestId: randomUUID(), role: "leader", membershipStatus: "active", resourceId: leader.tribeId, action: ADMISSION_ACTION.readPolicy };
      /** @param prepare - Catalog or row change visible only to this scenario's rolled-back transaction. @returns The inventory read after it. */
      const inventory = async (prepare?: (transaction: RequestDatabase) => Promise<unknown>): Promise<InventoryFacts> => {
        let facts: InventoryFacts | undefined;
        await database.withContext(leader.fixture.own, async (transaction) => {
          await prepare?.(transaction);
          const { tribeId, ...read } = await new PostgresAdmissionActivationRepository(transaction, context, { isPrepared: async () => true }, async () => false).read(context);
          expect(tribeId).toBe(leader.tribeId);
          facts = read;
          throw new GuardScenarioRollback();
        }).catch((error: unknown) => { if (!(error instanceof GuardScenarioRollback)) throw error; });
        return facts!;
      };
      const baseline = await inventory();
      const outcomes = {
        baseline,
        disabled_storage_trigger: await inventory((transaction) => transaction.execute(sql`alter table public.tribes disable trigger admission_control_marker_guard`)),
        disabled_ingress_trigger: await inventory((transaction) => transaction.execute(sql`alter table public.tribe_members disable trigger admission_member_unavailable`)),
        dropped_ingress_policy: await inventory((transaction) => transaction.execute(sql`drop policy academy_admission_provenance_required on public.tribe_members`)),
        unforced_rls: await inventory((transaction) => transaction.execute(sql`alter table public.academy_admission_membership_effects no force row level security`)),
        reset_function_search_path: await inventory((transaction) => transaction.execute(sql`alter function public.close_unavailable_admission_request(uuid,text,text) reset search_path`)),
        public_owner_function: await inventory((transaction) => transaction.execute(sql`grant execute on function public.close_unavailable_admission_request(uuid,text,text) to public`)),
        disabled_evaluator: await inventory((transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=false where tribe_id=${leader.tribeId}`)),
      };
      expect(outcomes).toEqual({
        baseline: { ...baseline, isAcademy: true, policyPresent: false, markerConsistent: true, storagePrepared: true, ingressProtected: true, runtimePrepared: true, evaluatorEnabled: true, recoveryLocked: false, unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 },
        disabled_storage_trigger: { ...baseline, storagePrepared: false },
        disabled_ingress_trigger: { ...baseline, ingressProtected: false },
        dropped_ingress_policy: { ...baseline, ingressProtected: false },
        unforced_rls: { ...baseline, storagePrepared: false },
        reset_function_search_path: { ...baseline, storagePrepared: false },
        public_owner_function: { ...baseline, storagePrepared: false },
        disabled_evaluator: { ...baseline, evaluatorEnabled: false },
      });
    });
  }, VALIDATION.timeoutMs);
});
