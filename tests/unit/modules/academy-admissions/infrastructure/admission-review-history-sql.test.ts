/** @vitest-environment node */
/** Exercises the real minimal request-history SQL scope and original cursor without broadening general audit. @module admission-review-history-sql-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionReviewHistoryDatabase } from "@/tests/support/admission-review-history-database";
import { ADMISSION_REVIEW_HISTORY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-review-history-validation";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { createAdmissionReviewHistoryTestError } from "@/tests/support/admission-review-history-diagnostics";

/** SQL projection carries only the fixed consumed scalars, never a private metadata document. */
type HistoryRow = { id: string; tribe_id: string; admission_request_id: string; event_type: string; from_status: string | null; to_status: string | null; resource_version: number | null; actor_kind: "account" | "unattributed"; created_at: Date | string; cursor_at: string };

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native request-scoped reviewer history", () => {
  it("should isolate current leader and guardian history, exact cursor, revoked authority and private audit fields", async () => {
    let stage: string = VALIDATION.stages.prepare;
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const fixture = await prepareAdmissionReviewHistoryDatabase(database, undefined, (phase) => { stage = phase; });
        /** @param account - Actual stored native identity. @param requestId - Explicit tenant-local selection. @param limit - Bounded SQL selection. @param cursor - Exact original SQL tuple. @param role - Real driver role, including forced non-bypass. @param targetTribeId - Explicit tenant scope. @returns The actual protected SQL projection. */
        const read = (account: typeof fixture.guardian, requestId: string | null = fixture.admissionRequestId, limit: number = VALIDATION.scannedPageSize, cursor?: { at: string; id: string }, role: "runtime" | "non_bypass" = "runtime", targetTribeId = fixture.tribeId) => database.withContext({ userId: account.userId, email: null }, async (transaction) => (await transaction.execute<HistoryRow>(sql`select * from public.read_admission_review_history(${targetTribeId},${account.sessionId},${requestId},${limit},${cursor?.at ?? null},${cursor?.id ?? null})`)).rows, role);
        stage = VALIDATION.stages.read;
        for (const role of ["runtime", "non_bypass"] as const) {
          for (const account of [fixture.leader, fixture.guardian]) {
            const first = await read(account, fixture.admissionRequestId, VALIDATION.scannedPageSize, undefined, role);
            expect(first).toHaveLength(VALIDATION.scannedPageSize);
            expect(first[0].id).toBe(fixture.eventIds.at(-1));
            expect(first.at(-1)?.cursor_at).toMatch(VALIDATION.middleCursorPattern);
            const last = first.at(-1)!;
            const second = await read(account, fixture.admissionRequestId, VALIDATION.scannedPageSize, { at: last.cursor_at, id: last.id }, role);
            expect(second).toHaveLength(VALIDATION.scannedPageSize);
            expect(new Set([...first, ...second].map((event) => event.id))).toEqual(new Set(fixture.eventIds));
            for (const event of [...first, ...second]) expect(event).toMatchObject({ tribe_id: fixture.tribeId, admission_request_id: fixture.admissionRequestId });
            const serialized = JSON.stringify([...first, ...second]);
            for (const privateValue of [VALIDATION.privateNote, fixture.applicant.email, fixture.otherRequestId, fixture.foreignTribeId]) expect(serialized).not.toContain(privateValue);
            for (const event of first) { expect(event).not.toHaveProperty("metadata"); expect(event).not.toHaveProperty("actor_user_id"); expect(event).not.toHaveProperty("operation_id"); expect(event).not.toHaveProperty("cause"); }
            expect(await read(account, fixture.admissionRequestId, 0, undefined, role)).toEqual([]);
            expect(await read(account, fixture.admissionRequestId, VALIDATION.invalidLimit, undefined, role)).toEqual([]);
            expect(await read(account, null, VALIDATION.scannedPageSize, undefined, role)).toEqual([]);
            expect(await read(account, randomUUID(), VALIDATION.scannedPageSize, undefined, role)).toEqual([]);
            expect(await read(account, fixture.foreignRequestId, VALIDATION.scannedPageSize, undefined, role)).toEqual([]);
          }
          expect(await read(fixture.applicant, fixture.admissionRequestId, VALIDATION.scannedPageSize, undefined, role)).toEqual([]);
          expect(await read({ ...fixture.guardian, sessionId: fixture.leader.sessionId }, fixture.admissionRequestId, VALIDATION.scannedPageSize, undefined, role)).toEqual([]);
          expect(await read(fixture.guardian, fixture.foreignRequestId, VALIDATION.scannedPageSize, undefined, role, fixture.foreignTribeId)).toEqual([]);
          expect(await read(fixture.leader, fixture.foreignRequestId, VALIDATION.scannedPageSize, undefined, role, fixture.foreignTribeId)).toEqual([]);
          const broad = await database.withContext({ userId: fixture.guardian.userId, email: null }, async (transaction) => (await transaction.execute(sql`select * from public.read_academy_admission_activity(${fixture.tribeId},${fixture.guardian.sessionId},${VALIDATION.scannedPageSize})`)).rows, role);
          expect(broad).toEqual([]);
        }
        stage = VALIDATION.stages.exposure;
        const exposures = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ actor_user_id: string; resource_id: string; resource_version: number; metadata: { surface: string; itemCount: number; resourceKind: string } }>(sql`select actor_user_id,resource_id,resource_version,metadata from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='authorized_exposure' and event_type='authorized_resource_exposure'`)).rows);
        expect(exposures).toHaveLength(VALIDATION.expectedReadExposures);
        for (const exposure of exposures) {
          expect([fixture.leader.userId, fixture.guardian.userId]).toContain(exposure.actor_user_id);
          expect(exposure).toMatchObject({ resource_id: fixture.admissionRequestId, resource_version: 1, metadata: { surface: "request_details", itemCount: 1, resourceKind: "requests" } });
          expect(JSON.stringify(exposure.metadata)).not.toContain(VALIDATION.privateNote);
          expect(JSON.stringify(exposure.metadata)).not.toContain(fixture.applicant.email);
        }
        stage = VALIDATION.stages.revoke;
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardian.userId}`));
        expect(await read(fixture.guardian)).toEqual([]);
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.leader.sessionId}`));
        expect(await read(fixture.leader)).toEqual([]);
        const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId}) as operations,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and status='pending' and version=1) as unchanged_requests`)).rows[0]);
        expect(effects).toEqual({ operations: 0, deliveries: 0, unchanged_requests: 2 });
      });
    } catch (error) {
      throw createAdmissionReviewHistoryTestError(error, stage);
    }
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
