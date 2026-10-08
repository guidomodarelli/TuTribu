/** @vitest-environment node */
/** Exercises authenticated applicant contact choices through the real query composition without creating code, quota, proof or membership. @module admission-contact-options-read-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native applicant contact choices", () => {
  it("should project only current email or phone choices and the sole country owner, hide anonymous/OFF data and create no effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      for (const migration of ["20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      await database.applyMigration("20261008230000_read_admission_contact_choices.sql");
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) });
      const query = admissionModule.createQueryModule({ executePublic: (run) => database.withContext({ userId: null, email: null }, run), readRecoveryLock: async () => false }).useCases.overview;
      const input = { slug: `issue-${fixture.context.tribeId}`, requestId: randomUUID() };
      const off = await query.execute(input);
      expect(off.ok).toBe(true);
      if (off.ok) expect(off.value).not.toHaveProperty("verification");
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const email = await query.execute(input);
      expect(email).toMatchObject({ ok: true, value: { verification: { channel: "email", allowedCountries: [] } } });
      if (email.ok) { expect(email.value).not.toHaveProperty("verification.connectionId"); expect(email.value).not.toHaveProperty("verification.quota"); expect(email.value).not.toHaveProperty("verification.secretRef"); }
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set contact_type='phone',phone_channel='whatsapp',allow_sms_alternative=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      expect(await query.execute(input)).toMatchObject({ ok: true, value: { verification: { channel: "whatsapp", allowedCountries: ["AR"], allowedAlternative: "sms" } } });
      await database.grantTablesToNonBypass(["session", "tribe_members"]);
      const ordinary = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run, "non_bypass") }).createQueryModule({ executePublic: (run) => database.withContext({ userId: null, email: null }, run, "non_bypass"), readRecoveryLock: async () => false }).useCases.overview;
      expect(await ordinary.execute(input)).toMatchObject({ ok: true, value: { verification: { channel: "whatsapp", allowedCountries: ["AR"], allowedAlternative: "sms" } } });
      const anonymous = buildAcademyAdmissionsModule({ accounts: { getAuthenticatedAccount: async () => null }, clock: () => new Date(), execute: () => { throw new Error("Anonymous contact options must not open an account checkout"); } }).createQueryModule({ executePublic: (run) => database.withContext({ userId: null, email: null }, run), readRecoveryLock: async () => false }).useCases.overview;
      const publicOverview = await anonymous.execute(input);
      expect(publicOverview.ok).toBe(true);
      if (publicOverview.ok) expect(publicOverview.value).not.toHaveProperty("verification");
      expect(await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute(sql`select * from public.read_admission_contact_choices(${fixture.context.tribeId},${fixture.context.sessionId})`)).rows, "non_bypass")).toEqual([]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select * from public.read_admission_contact_choices(${fixture.context.tribeId},${randomUUID()})`)).rows, "non_bypass")).toEqual([]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select verification_daily_limit from public.messaging_usage_policies where tribe_id=${fixture.context.tribeId}`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select messaging_connection_id from public.academy_admission_policies where tribe_id=${fixture.context.tribeId}`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.context.sessionId}`));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select * from public.read_admission_contact_choices(${fixture.context.tribeId},${fixture.context.sessionId})`)).rows, "non_bypass")).toEqual([]);
      expect(await fixture.counts()).toMatchObject({ operations: 0, challenges: 0, deliveries: 0, events: 0, proofs: 0, memberships: 0 });
    });
  }, 600_000);
});
