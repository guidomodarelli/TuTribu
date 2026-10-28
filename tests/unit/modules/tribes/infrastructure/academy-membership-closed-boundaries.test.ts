/** @vitest-environment node */
/** Exercises actual submit/review and deprecated join paths after protected configuration loss. @module academy-membership-closed-boundaries-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeAcademyAdmissionRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-academy-admission-repository";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native closed academy membership boundaries", () => {
  it.each(["missing_policy", "missing_settings", "disabled", "recovery_lock"] as const)("should keep actual submit, leader/guardian approval and legacy join closed after %s", async (change) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, historicalApplicant: guardian } = await prepareAllowlistAdmission(database, undefined, "active", "guardian");
      if (!guardian) throw new Error("Closed academy fixture failed: pre-cutover guardian unavailable");
      for (const migration of ["20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql", "20261011210000_preserve_admission_entry_marker.sql", "20261011223000_close_admission_scope_lifecycle.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const applicant = await createApplicant(), newcomer = await createApplicant();
      let recoveryLocked = false;
      /** @param actor - Actual persisted account/session. @returns Native commands reading the current hosting recovery state without body-supplied authority. */
      const commands = (actor: {userId: string;sessionId: string;email?: string}) => {
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: actor.userId, sessionId: actor.sessionId }), (_identity, run) => database.withContext({ userId: actor.userId, email: actor.email ?? null }, run));
        return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => ({ ...fixture.config, recoveryLocked }) }).useCases;
      };
      const pending = await commands(applicant).submit.execute({ ...applicant.input, expectedPolicyVersion: 3 });
      if (!pending.ok || pending.value.state !== "completed" || !pending.value.result.admissionRequestId) throw new Error(`Closed academy setup failed: real pending unavailable${pending.ok ? "" : `/${pending.failure.code}`}`, { cause: pending.ok ? undefined : pending.failure.cause });
      const requestId = pending.value.result.admissionRequestId;
      const before = await database.withContext(fixture.own, async (transaction) => ({
        request: (await transaction.execute<{id: string;status: string;version: number;submitted_at: string;expires_at: string}>(sql`select id,status,version,submitted_at::text,expires_at::text from public.academy_admission_requests where id=${requestId}`)).rows[0],
        actors: (await transaction.execute(sql`select id,user_id,role,status,created_at::text from public.tribe_members where tribe_id=${fixture.tribeId} order by id`)).rows,
      }));
      if (change === "recovery_lock") recoveryLocked = true;
      else await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        if (change === "missing_policy") await transaction.execute(sql`delete from public.academy_admission_policies where tribe_id=${fixture.tribeId}`);
        else if (change === "missing_settings") await transaction.execute(sql`delete from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`);
        else await transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=false where tribe_id=${fixture.tribeId}`);
      });
      const submission = await commands(newcomer).submit.execute({ ...newcomer.input, expectedPolicyVersion: 3 });
      expect(submission.ok).toBe(false);
      const lockedSubmissionCode = change === "recovery_lock" ? "connection_incomplete" : "admission_ineligible";
      if (!submission.ok) expect(submission.failure.code).toBe(change === "missing_policy" ? "policy_conflict" : lockedSubmissionCode);
      for (const actor of [fixture, guardian]) {
        const decision = await commands(actor).decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: before.request.version, confirmed: true, decision: "approve", internalReason: "Revisión con configuración cerrada", externalMessage: null });
        expect(decision.ok).toBe(false);
        const lockedDecisionCode = change === "recovery_lock" ? "connection_incomplete" : "admission_ineligible";
        if (!decision.ok) expect(decision.failure.code).toBe(change === "missing_settings" ? "request_conflict" : lockedDecisionCode);
      }
      const legacy = new PostgresTribeAcademyAdmissionRepository((run) => database.withContext({ userId: newcomer.userId, email: newcomer.email }, run));
      expect(await legacy.join({ tribeSlug: `allowlist-${fixture.tribeId}` })).toEqual({ status: "admission_closed" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as total from public.tribe_members where tribe_id=${fixture.tribeId} and user_id in (${applicant.userId},${newcomer.userId})`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select id,user_id,role,status,created_at::text from public.tribe_members where tribe_id=${fixture.tribeId} order by id`)).rows).toEqual(before.actors);
        expect((await transaction.execute(sql`select admissions_control_activated_at is not null as protected,public.academy_offer_requires_admission_request(${`allowlist-${fixture.tribeId}`}) as offer_protected from public.tribes where id=${fixture.tribeId}`)).rows).toEqual([{ protected: true, offer_protected: true }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${newcomer.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select outcome,rule from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual(change === "missing_settings" ? [{ outcome: "cancelled", rule: "academy_unavailable" }] : []);
        const request = (await transaction.execute(sql`select id,status,version,submitted_at::text,expires_at::text from public.academy_admission_requests where id=${requestId}`)).rows[0];
        expect(request).toEqual(change === "missing_settings" ? { ...before.request, status: "cancelled", version: before.request.version + 1 } : before.request);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
