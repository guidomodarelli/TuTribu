/** @vitest-environment node */
/** Exercises durable ownership per tribe through actual trusted presentation after a native email change. @module allowlist-contact-tenant-isolation-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native allowlist tenant contact isolation", () => {
  it("should keep the first tribe owner and independently bind the same current email to a different account in another tribe", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), first = await createApplicant(), next = await createApplicant();
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      expect((await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: first.email }, displayName: null })).state).toBe("completed");
      expect(await first.commands.submit.execute(first.input)).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted" } } });
      const otherTribeId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${otherTribeId},'Other synthetic contact tribe',${`isolation-${otherTribeId}`},${fixture.userId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${otherTribeId},'academy',true)`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${otherTribeId},${fixture.userId},'leader','active')`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,mode,is_open,allow_common_exceptions,activated_at) values (${otherTribeId},'allowlist',true,false,${now})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${otherTribeId}`);
        await transaction.execute(sql`update public."user" set email=${`changed.${randomUUID()}@example.test`} where id=${first.userId}`);
        await transaction.execute(sql`update public."user" set email=${first.email} where id=${next.userId}`);
        await transaction.execute(sql`insert into public.global_identity_evidence(user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${next.userId},${next.accountId},'google',${next.subject},${first.email},true,'example.test','workspace','https://accounts.google.com','synthetic-list-client',clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp())`);
        const fingerprint = await createAdmissionContactFingerprint({ type: "email", value: first.email }, fixture.config);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,origin,created_by_user_id,updated_by_user_id) values (${otherTribeId},'email',${first.email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'manual',${fixture.userId},${fixture.userId})`);
      });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: next.userId, sessionId: next.sessionId }), (_scope, run) => database.withContext({ userId: next.userId, email: null }, run));
      const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
      expect(await commands.submit.execute({ tribeId: otherTribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 1, confirmed: true })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted" } } });
      expect(await next.commands.submit.execute({ ...next.input, message: "No transfiere el primer vínculo." })).toMatchObject({ ok: false, failure: { code: "contact_binding_conflict" } });
      await database.withContext(fixture.own, async (transaction) => {
        const bindings = (await transaction.execute<{ tribe_id: string; owner_user_id: string }>(sql`select tribe_id,owner_user_id from public.academy_admission_contact_bindings where normalized_contact=${first.email} order by tribe_id`)).rows;
        expect(bindings).toEqual([{ tribe_id: fixture.tribeId, owner_user_id: first.userId }, { tribe_id: otherTribeId, owner_user_id: next.userId }].sort((left, right) => left.tribe_id.localeCompare(right.tribe_id)));
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${next.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 1_200_000);
});
