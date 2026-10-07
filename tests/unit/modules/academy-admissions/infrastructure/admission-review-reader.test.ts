/** @vitest-environment node */
/** Exercises real reviewer SQL projection/RLS, native auth, stable pagination and revocation. @module admission-review-reader-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionReviewReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-review-reader";
import { projectAdmissionReview } from "@/src/modules/academy-admissions/application/results/admission-review-projection";
import { admissionReviewQuerySchema } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-schemas";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";

describe("current admission reviewer SQL", () => {
  it.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("should read only current leader/guardian scope oldest-first and close on current role/session revocation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261007005000_read_admission_reviews.sql"]) await database.applyMigration(migration);
      const tribeId = randomUUID(), foreignTribeId = randomUUID(), leaderId = fixture.userId, guardianId = randomUUID(), applicantId = randomUUID(), secondId = randomUUID();
      const leaderSession = randomUUID(), guardianSession = randomUUID(), applicantSession = randomUUID();
      const firstRequest = randomUUID(), secondRequest = randomUUID(), foreignRequest = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const activatedAt = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        for (const userId of [guardianId, applicantId, secondId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},${userId === applicantId ? "Primer solicitante" : "Otra cuenta"},${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        for (const [userId, sessionId] of [[leaderId, leaderSession], [guardianId, guardianSession], [applicantId, applicantSession]]) await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        for (const id of [tribeId, foreignTribeId]) {
          await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${id},'Synthetic review academy',${`review-${id}`},${leaderId})`);
          await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${id},'academy',true)`);
          await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${id},true,${activatedAt})`);
        }
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active'),(${tribeId},${guardianId},'guardian','active')`);
        for (const id of [tribeId, foreignTribeId]) await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${activatedAt} where id=${id}`);
        for (const [id, targetTribe, userId, delay] of [[firstRequest, tribeId, applicantId, 2], [secondRequest, tribeId, secondId, 1], [foreignRequest, foreignTribeId, applicantId, 0]] as const) await transaction.execute(sql`with instant as (select clock_timestamp()-${delay}*interval '1 minute' as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,submitted_at,expires_at) select ${id},${targetTribe},${userId},'common','email',${`${userId}@example.test`},'declared','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,'Quiero participar.',now,now+interval '30 days' from instant`);
      });
      await database.grantTablesToNonBypass(["tribes", "tribe_members", "tribe_invitations", "tribe_academy_settings", "user", "session", "account", "global_session_identity_bindings", "global_identity_evidence", "recent_authentication_evidence", "academy_admission_requests", "academy_admission_policies"]);
      const scope = { tribeId, userId: guardianId, sessionId: guardianSession, requestId: randomUUID() };
      for (const role of ["runtime", "non_bypass"] as const) {
        const reader = new PostgresAdmissionReviewReader((current, run) => database.withContext({ userId: current.userId, email: null }, run, role), async () => false);
        const first = await reader.readList(scope, { limit: 1, status: "pending" });
        expect(first.records.map((record) => record.request.id)).toEqual([firstRequest]);
        expect(first.nextCursor).toEqual(expect.any(String));
        const parsed = admissionReviewQuerySchema.parse({ cursor: first.nextCursor, limit: "1", status: "pending" });
        const second = await reader.readList(scope, parsed);
        expect(second.records.map((record) => record.request.id)).toEqual([secondRequest]);
        expect(second.nextCursor).toBeNull();
        expect((await reader.readList(scope, { limit: 25, search: "Primer" })).records.map((record) => record.request.id)).toEqual([firstRequest]);
        expect((await reader.readList(scope, { limit: 25, needsVerification: true })).records).toEqual([]);
        expect(await reader.readDetail(scope, foreignRequest)).toBeNull();
        expect(projectAdmissionReview(first.records[0])).toMatchObject({ id: firstRequest, evidence: { kind: "declared" }, eligibleActions: ["reject", "approve"], applicantMessage: "Quiero participar." });
        await expect(reader.readList({ ...scope, userId: applicantId, sessionId: applicantSession }, { limit: 25 })).rejects.toMatchObject({ code: "permission_denied" });
        expect((await reader.readList({ ...scope, userId: leaderId, sessionId: leaderSession }, { limit: 25 })).records).toHaveLength(2);
      }
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: guardianId, sessionId: guardianSession }), (identity, run) => database.withContext({ userId: identity.userId, email: null }, run, "non_bypass"));
      const reviewModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run, "non_bypass") }).createReviewQueryModule({ readRecoveryLock: async () => false });
      expect(await reviewModule.useCases.review.detail({ tribeId, admissionRequestId: firstRequest, requestId: randomUUID() })).toMatchObject({ ok: true, value: { id: firstRequest, applicant: { id: applicantId } } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,is_open=false,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${tribeId}`));
      const pausedReader = new PostgresAdmissionReviewReader((current, run) => database.withContext({ userId: current.userId, email: null }, run, "non_bypass"), async () => false);
      expect((await pausedReader.readList(scope, { limit: 25, needsVerification: true })).records.map((record) => record.request.id)).toEqual([]);
      const pausedFalse = await pausedReader.readList(scope, { limit: 25, needsVerification: false });
      expect(pausedFalse.records.map((record) => projectAdmissionReview(record).needsVerification)).toEqual([false, false]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${tribeId} and user_id=${guardianId}`));
      const reader = new PostgresAdmissionReviewReader((current, run) => database.withContext({ userId: current.userId, email: null }, run, "non_bypass"), async () => false);
      await expect(reader.readDetail(scope, firstRequest)).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${leaderSession}`));
      await expect(reader.readList({ ...scope, userId: leaderId, sessionId: leaderSession }, { limit: 25 })).rejects.toMatchObject({ code: "authentication_required" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${tribeId}) as operations,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${tribeId}) as bindings,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries`)).rows)).toEqual([{ operations: 0, bindings: 0, deliveries: 0 }]);
    });
  }, 240_000);
});
