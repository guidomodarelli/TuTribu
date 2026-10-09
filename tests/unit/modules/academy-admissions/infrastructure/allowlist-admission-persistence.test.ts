/** @vitest-environment node */
/** Exercises native trusted list presentation and indivisible system approval on an owned SQL branch. @module allowlist-admission-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native trusted list admission", () => {
  it("should atomically bind a trusted exact contact and approve once as system without editing the entry or notifying reviewers of a pending request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database), applicantId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), email = `synthetic.${randomUUID()}+tag@example.test`, evidenceId = randomUUID();
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.own, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Synthetic list applicant',${email},false,${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${applicantId},${randomUUID()},clock_timestamp()+interval '1 hour',${now},${now})`);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${applicantId},'google',${subject},${now},${now})`);
        await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${evidenceId},${applicantId},${accountId},'google',${subject},${email},true,'example.test','workspace','https://accounts.google.com','synthetic-list-client',${now},clock_timestamp()+interval '1 hour',${now})`);
        await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',is_open=true,allow_common_exceptions=true,activated_at=${now},version=version+1 where tribe_id=${fixture.tribeId}`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${fixture.tribeId}`);
      });
      const leader = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry), entry = await fixture.writer.create({ context: leader, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: email }, displayName: "Nombre orientativo" });
      if (entry.state !== "completed") throw new Error("Native list fixture entry did not complete");
      const own = { userId: applicantId, email }, accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: applicantId, sessionId }), (_identity, run) => database.withContext(own, run));
      const request = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
      const input = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const };
      const submitted = await request.submit.execute(input);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted", created: true, membership: { role: "tribemate", status: "active" } } } });
      expect(await request.submit.execute(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.ok && submitted.value.state === "completed" ? submitted.value.result : null } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,evidence_source,global_identity_evidence_id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${applicantId}`)).rows).toEqual([{ status: "approved", evidence_source: "base", global_identity_evidence_id: evidenceId }]);
        expect((await transaction.execute(sql`select actor_kind,actor_user_id,rule from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and user_id=${applicantId}`)).rows).toEqual([{ actor_kind: "system", actor_user_id: null, rule: "automatic" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${applicantId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicantId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select version,status,display_name from public.academy_allowlist_entries where id=${entry.result.entryId}`)).rows).toEqual([{ version: 1, status: "enabled", display_name: "Nombre orientativo" }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ event_type: "approved" }]);
      });
    });
  }, 1_200_000);
});
