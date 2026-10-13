/** @vitest-environment node */
/** Exercises current admission policy after leaving a legitimately approved old request whose cadence already elapsed. @module academy-membership-current-policy-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareTribeMembershipLifecycle } from "@/tests/support/tribe-membership-lifecycle-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native membership current-policy reentry", () => {
  it("should evaluate the current closed and reopened policy after real approval and exit instead of treating an old approval as perpetual authority", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareTribeMembershipLifecycle(database, false, 2), own = { userId: fixture.leader.userId, email: fixture.leader.email };
      for (const migration of ["20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261011024000_read_current_own_admission_eligibility.sql", "20261007005000_read_admission_reviews.sql"]) await database.applyMigration(migration);
      /** Creates the real current admission commands on a stored native account and its original guarded executor. */
      function admission(actor: typeof fixture.leader) {
        const accounts = fixture.owner(actor).accounts;
        return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.security }).useCases;
      }
      const leader = admission(fixture.leader), applicant = admission(fixture.historical);
      const elapsed = await database.withContext(own, async (transaction) => (await transaction.execute<{cadence_elapsed: boolean;tenant_predates_request: boolean;account_predates_request: boolean}>(sql`select request.submitted_at+interval '24 hours'<=clock_timestamp() as cadence_elapsed,tribe.created_at<=request.submitted_at as tenant_predates_request,account."createdAt"<=request.submitted_at as account_predates_request from public.academy_admission_requests request join public.tribes tribe on tribe.id=request.tribe_id join public."user" account on account.id=request.user_id where request.id=${fixture.historicalRequestId}`)).rows[0]);
      expect(elapsed).toEqual({ cadence_elapsed: true, tenant_predates_request: true, account_predates_request: true });
      const approved = await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: fixture.historicalRequestId, expectedVersion: 1, confirmed: true, decision: "approve", internalReason: "Solicitud histórica vigente", externalMessage: null });
      if (!approved.ok) {
        let cause = approved.failure.cause;
        while (cause && typeof cause === "object" && "cause" in cause && cause.cause) cause = cause.cause;
        const sqlState = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && /^[0-9A-Z]{5}$/.test(cause.code) ? cause.code : "unavailable";
        throw new Error(`Historical membership approval failed: ${approved.failure.code}; SQLSTATE=${sqlState}`, { cause: approved.failure.cause });
      }
      expect(approved).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved" } } });
      const member = await database.withContext(own, async (transaction) => (await transaction.execute<{id: string;admission_membership_effect_id: string}>(sql`select id,admission_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.historical.userId}`)).rows[0]);
      await expect(fixture.owner(fixture.historical).useCases.change({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), memberId: member.id, action: "leave", expectedStatus: "active", confirmed: true })).resolves.toMatchObject({ state: "completed", result: { outcome: "changed", deleted: true } });
      await database.withContext(own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      const command = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const };
      const closed = await applicant.submit.execute(command);
      if (closed.ok || closed.failure.code !== "admission_ineligible") {
        let cause = closed.ok ? null : closed.failure.cause;
        while (cause && typeof cause === "object" && "cause" in cause && cause.cause) cause = cause.cause;
        const sqlState = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && /^[0-9A-Z]{5}$/.test(cause.code) ? cause.code : "unavailable";
        throw new Error(`Closed historical entry failed: ${closed.ok ? "unexpected_success" : closed.failure.code}; SQLSTATE=${sqlState}`, { cause: closed.ok ? undefined : closed.failure.cause });
      }
      // Submission maps the current closed eligibility to its existing safe contract; decisions have a separate pause code.
      expect(closed).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await database.withContext(own, async (transaction) => (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.historical.userId}`)).rows[0].count)).toBe(0);
      await database.withContext(own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=true,version=version+1 where tribe_id=${fixture.tribeId}`));
      expect(await applicant.submit.execute({ ...command, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "policy_conflict" } });
      const submitted = await applicant.submit.execute({ ...command, operationId: randomUUID(), expectedPolicyVersion: 3 });
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: true } } });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Current-policy reentry failed: new pending unavailable");
      expect(submitted.value.result.admissionRequestId).not.toBe(fixture.historicalRequestId);
      const final = await database.withContext(own, async (transaction) => ({
        requests: (await transaction.execute(sql`select id,status,original_policy_snapshot->>'version' as original_version from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${fixture.historical.userId} order by submitted_at`)).rows,
        members: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.historical.userId}`)).rows[0].count,
        oldEffect: (await transaction.execute(sql`select applied_at is not null as applied,revoked_at is not null as revoked,member_id from public.academy_admission_membership_effects where id=${member.admission_membership_effect_id}`)).rows[0],
      }));
      expect(final).toEqual({ requests: [{ id: fixture.historicalRequestId, status: "approved", original_version: "1" }, { id: submitted.value.result.admissionRequestId, status: "pending", original_version: "3" }], members: 0, oldEffect: { applied: true, revoked: true, member_id: null } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
