/** @vitest-environment node */
/** Pins on real PostgreSQL that an active manual email policy with codes OFF switches to the allowlist through the real policy writer and preparation. @module admission-policy-allowlist-switch-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionWhatsappBrowser } from "@/tests/support/admission-whatsapp-browser-fixture";
import { PostgresAdmissionPolicyRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-repository";
import { PostgresAdmissionPolicyPreparationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-preparation-reader";
import { PostgresAdmissionActivationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activation-repository";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import { PostgresMessagingUsageRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-repository";
import { AdmissionMessagingUsagePolicyReader } from "@/src/modules/academy-admissions/infrastructure/verification/messaging-usage-policy-reader";
import { ReadAdmissionRuntimeUseCase } from "@/src/modules/academy-admissions/application/use-cases/read-admission-runtime-use-case";
import { authorizeAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-authorizer";
import { MANUAL_ADMISSION_EXECUTION_CAPABILITIES } from "@/src/modules/academy-admissions/constants/admission-execution-capabilities";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

const SUITE_TIMEOUT_MS = 900_000;
const LISTED_ENTRY_COUNT = 4;
/** A PostgreSQL timestamp text with more than three fractional digits. */
const SUB_MILLISECOND_INSTANT = /\.\d{4,6}\+/;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native switch of an active manual policy to the allowlist", () => {
  it("should save the allowlist mode with email contact and codes OFF through the real preparation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: "synthetic-allowlist-switch", MESSAGING_SECURITY_EPOCH: randomUUID(), MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: JSON.stringify(keyrings) });
      const fixture = await prepareAdmissionWhatsappBrowser(database, config);
      for (let index = 0; index < LISTED_ENTRY_COUNT; index += 1) {
        const created = await fixture.writer.create({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry), operationId: randomUUID(), confirmed: true, contact: { type: "email", value: `listed-${randomUUID()}@example.test` }, displayName: null });
        expect(created.state).toBe("completed");
      }
      const runtime = new ReadAdmissionRuntimeUseCase({ getCapabilities: () => ({ sources: [...MANUAL_ADMISSION_EXECUTION_CAPABILITIES.sources], policyModes: [...MANUAL_ADMISSION_EXECUTION_CAPABILITIES.policyModes], additionalVerification: MANUAL_ADMISSION_EXECUTION_CAPABILITIES.additionalVerification }) });
      const repository = new PostgresAdmissionPolicyRepository((_context, run) => database.withContext(fixture.own, run), async () => config, (transaction: RequestDatabase, authority: AuthorizedAdmissionContext) => {
        /** @param current - Native preparation transaction. @param tribeId - Exact own policy tribe. @returns Current scoped authority after native session and leader checks. */
        const authorize = async (current: RequestDatabase, tribeId: string) => { if (tribeId !== authority.tribeId) return false; await authorizeAdmissionPolicy(current, authority, authority.sensitiveOperation); return true; };
        return new PostgresAdmissionPolicyPreparationReader(new PostgresAdmissionActivationRepository(transaction, authority, runtime, async () => false), new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, authorize)), new PostgresAdmissionVerificationReadinessReader(transaction, authorize, async () => config), async () => config);
      });
      /** @returns The persisted policy, its exact activation instant and the tribe marker, read as the owner. */
      const readPolicy = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ mode: string; version: number; contact_type: string; requires_additional_verification: boolean; activated_at: string; marker: string; entries: number }>(sql`select policy.mode,policy.version,policy.contact_type,policy.requires_additional_verification,policy.activated_at::text as activated_at,tribe.admissions_control_activated_at::text as marker,(select count(*)::int from public.academy_allowlist_entries entry where entry.tribe_id=policy.tribe_id) as entries from public.academy_admission_policies policy join public.tribes tribe on tribe.id=policy.tribe_id where policy.tribe_id=${fixture.tribeId}`)).rows[0]);
      const before = await readPolicy();
      expect(before).toMatchObject({ mode: ADMISSION_POLICY_MODE.manualReview, contact_type: "email", requires_additional_verification: false, entries: LISTED_ENTRY_COUNT, marker: before.activated_at });
      // The fixture activates with microseconds, which a JavaScript Date cannot carry.
      expect(before.activated_at).toMatch(SUB_MILLISECOND_INSTANT);
      const context: AuthorizedAdmissionContext = { ...(await fixture.confirm(REAUTHENTICATION_OPERATION.updateAdmissionPolicy)), action: ADMISSION_ACTION.configurePolicy };
      expect(await repository.update({ context, operationId: randomUUID(), type: "update_admission_policy", confirmed: true, expectedVersion: before.version, patch: { mode: ADMISSION_POLICY_MODE.allowlist } })).toMatchObject({ state: "completed", result: { version: before.version + 1, changed: true } });
      // The switch keeps the activation instant to the microsecond, so the protection marker stays consistent and the list is untouched.
      expect(await readPolicy()).toEqual({ ...before, mode: ADMISSION_POLICY_MODE.allowlist, version: before.version + 1 });
    });
  }, SUITE_TIMEOUT_MS);
});
