/** @vitest-environment node */
/** Pins on real PostgreSQL the tenant facts the leader's policy preparation reads and the settings row it keeps locked, so its queries can change without changing its result. @module admission-policy-preparation-parity-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionLeader } from "@/tests/support/admission-leader-fixture";
import { GuardScenarioRollback } from "@/tests/support/guard-lock-order";
import { isAcademySettingsLocked } from "@/tests/support/academy-settings-lock-probe";
import { PostgresAdmissionPolicyPreparationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-preparation-reader";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import type { AdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { ADMISSION_POLICY_PREPARATION_PARITY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-policy-preparation-parity";

/** Tenant facts this reader owns, plus whether the settings row stays locked after the read; preflight, countries and channel come from their owned ports. */
type PreparationFacts = { isAcademy: boolean; controlActivated: boolean; evaluatorEnabled: boolean; preflightComplete: boolean; settingsLocked: boolean };

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission policy preparation parity", () => {
  it("should read the same tenant facts, keep the settings row locked and follow every settings or marker change", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const leader = await prepareAdmissionLeader(database, { sessionLifetimeMs: VALIDATION.sessionLifetimeMs });
      const policy: AdmissionPolicy = { id: leader.tribeId, tribeId: leader.tribeId, mode: ADMISSION_POLICY_MODE.manualReview, contactType: ADMISSION_CONTACT_TYPE.email, isOpen: true, allowCommonExceptions: false, requiresAdditionalVerification: false, phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null, version: 1, verificationEpoch: 1, activatedAt: null };
      /** @param prepare - Row change visible only to this scenario's rolled-back transaction. @returns The facts read after it. */
      const preparation = async (prepare?: (transaction: RequestDatabase) => Promise<unknown>): Promise<PreparationFacts> => {
        let facts: PreparationFacts | undefined;
        await database.withContext(leader.fixture.own, async (transaction) => {
          await prepare?.(transaction);
          const read = await new PostgresAdmissionPolicyPreparationReader(transaction, { isPrepared: async () => true }, { readForTribe: async () => null }, { read: async () => ({ channelPrepared: false, smsAlternativePrepared: false, verificationQuotaPositive: false }) }, () => readMessagingHostingSecurityConfig()).read(policy);
          expect(read.tribeId).toBe(leader.tribeId);
          facts = { isAcademy: read.isAcademy, controlActivated: read.controlActivated, evaluatorEnabled: read.evaluatorEnabled, preflightComplete: read.preflightComplete, settingsLocked: await isAcademySettingsLocked(database, leader) };
          throw new GuardScenarioRollback();
        }).catch((error: unknown) => { if (!(error instanceof GuardScenarioRollback)) throw error; });
        return facts!;
      };
      const baseline = await preparation();
      const outcomes = {
        baseline,
        disabled_evaluator: await preparation((transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=false where tribe_id=${leader.tribeId}`)),
        legacy_access_model: await preparation((transaction) => transaction.execute(sql`update public.tribe_academy_settings set access_model=${TRIBE_ACCESS_MODEL.legacy},admission_enabled=false,sales_enabled=false where tribe_id=${leader.tribeId}`)),
        missing_settings: await preparation((transaction) => transaction.execute(sql`delete from public.tribe_academy_settings where tribe_id=${leader.tribeId}`)),
        activated_marker: await preparation(async (transaction) => {
          await transaction.execute(sql`alter table public.tribes disable trigger admission_control_marker_guard`);
          await transaction.execute(sql`update public.tribes set admissions_control_activated_at=now() where id=${leader.tribeId}`);
        }),
      };
      expect(outcomes).toEqual({
        baseline: { isAcademy: true, controlActivated: false, evaluatorEnabled: true, preflightComplete: true, settingsLocked: true },
        disabled_evaluator: { ...baseline, evaluatorEnabled: false },
        legacy_access_model: { ...baseline, isAcademy: false, evaluatorEnabled: false },
        missing_settings: { ...baseline, isAcademy: false, evaluatorEnabled: false },
        activated_marker: { ...baseline, controlActivated: true },
      });
    });
  }, VALIDATION.timeoutMs);
});
