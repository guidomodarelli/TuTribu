/** @vitest-environment node */
/** Exercises the real composed reviewer-history module and native account/resource authorization. @module admission-review-history-module-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionReviewHistoryDatabase, type AdmissionReviewHistoryTestIdentity } from "@/tests/support/admission-review-history-database";
import { createAdmissionReviewHistoryTestError } from "@/tests/support/admission-review-history-diagnostics";
import { ADMISSION_REVIEW_HISTORY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-review-history-validation";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "@/src/modules/academy-admissions/constants/admission-public-contract";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native composed review-history query", () => {
  it("should compose native leader and guardian history with safe legacy mapping and current revocation", async () => {
    let stage: string = VALIDATION.stages.prepare;
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const fixture = await prepareAdmissionReviewHistoryDatabase(database, undefined, (phase) => { stage = phase; });
        expect(database.nonBypassRole).toMatchObject({ bypassesRls: false, isSuperuser: false });
        expect(Object.values(fixture.readRolePrivileges.before).some((available) => !available)).toBe(true);
        expect(Object.values(fixture.readRolePrivileges.after).every(Boolean)).toBe(true);
        const emptyHistoryRequestId = randomUUID();
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) select ${emptyHistoryRequestId},${fixture.tribeId},${fixture.leader.userId},'common','email',${fixture.own.email},'declared',${JSON.stringify(VALIDATION.originalPolicy)}::jsonb,now,now+interval '30 days' from instant`));
        for (const role of ["non_bypass", "runtime"] as const) {
          stage = "compose_native_history_query";
          /** @param currentIdentity - One request's fixed native identity. @returns The real scoped factory without a provider, keyring or account-switching mock. */
          const createHistoryModule = (currentIdentity: AdmissionReviewHistoryTestIdentity) => {
            const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: currentIdentity.userId, sessionId: currentIdentity.sessionId }), (identity, run) => database.withContext({ userId: identity.userId, email: null }, run, role));
            return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run, role) }).createReviewHistoryQueryModule();
          };
          const query = { tribeId: fixture.tribeId, admissionRequestId: fixture.admissionRequestId, requestId: randomUUID(), limit: VALIDATION.scannedPageSize };
          for (const identity of [fixture.leader, fixture.guardian]) {
            const selection = `${role}:${identity === fixture.leader ? "leader" : "guardian"}`;
            const historyModule = createHistoryModule(identity); stage = `read_composed_history:${selection}`;
            const first = await historyModule.useCases.history.execute(query);
            stage = `verify_composed_history:${selection}`;
            if (!first.ok) { stage = `composed_history_failure:${selection}:${first.failure.code}`; throw first.failure.cause ?? new Error("Native history query was denied"); }
            expect(first).toMatchObject({ ok: true, value: { tribeId: fixture.tribeId, admissionRequestId: fixture.admissionRequestId, items: [{ eventType: "unclassified", actorKind: "unattributed" }, { eventType: "proof_attached", actorKind: "unattributed" }] } });
            stage = "continue_original_history_cursor";
            const [at, id] = first.value.nextCursor!.split(ADMISSION_REVIEW_CURSOR_SEPARATOR);
            expect(at).toMatch(VALIDATION.middleCursorPattern);
            const second = await historyModule.useCases.history.execute({ ...query, cursor: { at, id } });
            expect(second.ok).toBe(true);
            if (!second.ok) throw new Error("Native history continuation was unavailable");
            expect(second.value.items.at(-1)?.actorKind).toBe("account");
            expect(new Set([...first.value.items, ...second.value.items].map((event) => event.id))).toEqual(new Set(fixture.eventIds));
            stage = "verify_composed_history_privacy";
            const payload = JSON.stringify(first.value);
            for (const privateValue of [VALIDATION.privateNote, VALIDATION.unknownEvent, VALIDATION.unknownCause, fixture.applicant.email, fixture.guardian.sessionToken, fixture.foreignTribeId]) expect(payload).not.toContain(privateValue);
            stage = "verify_native_history_exposure_actor";
            const exposure = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ actor_user_id: string }>(sql`select actor_user_id from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_id=${fixture.admissionRequestId} and resource_type='authorized_exposure' order by created_at desc,id desc limit 1`)).rows[0]);
            expect(exposure.actor_user_id).toBe(identity.userId);
            expect(await historyModule.useCases.history.execute({ ...query, admissionRequestId: fixture.foreignRequestId })).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
          }
          stage = "read_authorized_empty_history";
          expect(await createHistoryModule(fixture.leader).useCases.history.execute({ ...query, admissionRequestId: emptyHistoryRequestId })).toMatchObject({ ok: true, value: { items: [], nextCursor: null } });
          expect(await createHistoryModule(fixture.applicant).useCases.history.execute(query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
          expect(await createHistoryModule(fixture.guardian).useCases.history.execute({ ...query, tribeId: fixture.foreignTribeId, admissionRequestId: fixture.foreignRequestId })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
        }
        stage = VALIDATION.stages.revoke;
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardian.userId}`));
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.guardian.userId, sessionId: fixture.guardian.sessionId }), (identity, run) => database.withContext({ userId: identity.userId, email: null }, run, "non_bypass"));
        const historyModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run, "non_bypass") }).createReviewHistoryQueryModule();
        expect(await historyModule.useCases.history.execute({ tribeId: fixture.tribeId, admissionRequestId: fixture.admissionRequestId, requestId: randomUUID(), limit: VALIDATION.scannedPageSize })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
      });
    } catch (error) { throw createAdmissionReviewHistoryTestError(error, stage); }
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
