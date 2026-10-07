/** @vitest-environment node */
/** Exercises own request projection and readonly isolation with both actual PostgreSQL roles. @module own-admission-reader-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresOwnAdmissionRequestReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-own-admission-request-reader";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("own admission request reader", () => {
  it("should project only the current nonmember's masked request under both roles and leave absence without effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      await database.applyMigration("20261006233000_index_admission_account_history.sql");
      await database.applyMigration("20261006234000_read_own_admission_summary.sql");
      await database.applyMigration("20261007004000_read_exact_own_admission_request.sql");
      const tribeId = randomUUID(), sessionId = randomUUID(), otherSessionId = randomUUID(), otherUserId = randomUUID(), requestId = randomUUID(), foreignRequestId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${otherUserId},'Synthetic other applicant',${`${otherUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic own-query academy',${`own-query-${tribeId}`},${fixture.userId})`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,requires_additional_verification) values (${tribeId},true)`);
        for (const [userId, currentSessionId] of [[fixture.userId, sessionId], [otherUserId, otherSessionId]]) await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${currentSessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        for (const [id, userId] of [[requestId, fixture.userId], [foreignRequestId, otherUserId]]) await transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) select ${id},${tribeId},${userId},'common','email',${`${userId}@example.test`},'declared',now,now+interval '30 days' from instant`);
      });
      await database.grantTablesToNonBypass(["session", "academy_admission_requests", "academy_admission_decisions", "academy_admission_policies", "academy_admission_verification_proofs"]);
      for (const role of ["runtime", "non_bypass"] as const) {
        const reader = new PostgresOwnAdmissionRequestReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run, role));
        const own = await reader.readOwn({ userId: fixture.userId, sessionId, tribeId, requestId: randomUUID() });
        expect(own).toMatchObject({ id: requestId, status: "pending", version: 1, needsVerification: true, contact: { type: "email", evidenceKind: "declared" } });
        expect(JSON.stringify(own)).not.toContain(fixture.own.email);
        expect(JSON.stringify(own)).not.toContain(otherUserId);
        expect(own).not.toHaveProperty("internalReason");
        expect(own).not.toHaveProperty("proofId");
        expect(await reader.readOwn({ userId: otherUserId, sessionId: otherSessionId, tribeId, requestId: randomUUID() })).toMatchObject({ id: foreignRequestId });
        expect(await reader.readOwn({ userId: fixture.userId, sessionId, tribeId: randomUUID(), requestId: randomUUID() })).toBeNull();
      }
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId }), (identity, run) => database.withContext({ userId: identity.userId, email: null }, run));
      const reader = new PostgresOwnAdmissionRequestReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
      const requestModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config });
      expect(await requestModule.useCases.own.getOwn({ tribeId, requestId: randomUUID() })).toMatchObject({ ok: true, value: { id: requestId } });
      await database.withContext(fixture.own, async (transaction) => {
        const decisionId = randomUUID();
        await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason,external_message) values (${decisionId},${requestId},${tribeId},${fixture.userId},1,'rejected',${otherUserId},'user','synthetic_read_only_review',1,1,'Synthetic private reviewer note','Podés volver a presentar tu solicitud cuando termine el plazo.')`);
        await transaction.execute(sql`update public.academy_admission_requests set status='rejected',version=2,decision_id=${decisionId} where id=${requestId}`);
        await transaction.execute(sql`insert into public.academy_admission_notification_obligations(tribe_id,request_id,applicant_user_id,event_type) values (${tribeId},${requestId},${fixture.userId},'rejected')`);
        await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type) values (${tribeId},${otherUserId},'admission_request',${requestId},'rejected')`);
      });
      const restricted = new PostgresOwnAdmissionRequestReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run, "non_bypass"));
      const rejected = await restricted.readOwn({ userId: fixture.userId, sessionId, tribeId, requestId: randomUUID() });
      expect(rejected).toMatchObject({ id: requestId, status: "rejected", version: 2, externalMessage: "Podés volver a presentar tu solicitud cuando termine el plazo.", retryAllowedAt: expect.any(String) });
      expect(JSON.stringify(rejected)).not.toContain("Synthetic private reviewer note");
      const newerRequestId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,submitted_at,expires_at) select ${newerRequestId},${tribeId},${fixture.userId},'common',now,now+interval '30 days' from instant`));
      for (const role of ["runtime", "non_bypass"] as const) {
        const historicalReader = new PostgresOwnAdmissionRequestReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run, role));
        expect(await historicalReader.readOwn({ userId: fixture.userId, sessionId, tribeId, requestId: randomUUID() })).toMatchObject({ id: newerRequestId, status: "pending" });
        expect(await historicalReader.readOwn({ userId: fixture.userId, sessionId, tribeId, requestId: randomUUID(), admissionRequestId: requestId })).toMatchObject({ id: requestId, status: "rejected", version: 2 });
        expect(await historicalReader.readOwn({ userId: fixture.userId, sessionId, tribeId, requestId: randomUUID(), admissionRequestId: foreignRequestId })).toBeNull();
      }
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${sessionId}`));
      await expect(reader.readOwn({ userId: fixture.userId, sessionId, tribeId, requestId: randomUUID() })).rejects.toMatchObject({ code: "authentication_required" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${tribeId}) as operations,(select count(*)::int from public.tribe_members where tribe_id=${tribeId}) as members,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${tribeId}) as bindings`)).rows)).toEqual([{ operations: 0, members: 0, bindings: 0 }]);
    });
  }, 180_000);
});
