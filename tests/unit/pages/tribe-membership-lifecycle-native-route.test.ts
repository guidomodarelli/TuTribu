/** @vitest-environment node */
/** Exercises the deployed Next route boundary with real Better Auth and an owned PostgreSQL branch. @module tribe-membership-lifecycle-native-route-tests */
import { randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareTribeMembershipLifecycle } from "@/tests/support/tribe-membership-lifecycle-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS } from "@/tests/support/constants/legacy-admission-entry";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native membership lifecycle HTTP", () => {
  it("should authorize real sessions and preserve original moderation and leave results through the production routes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareTribeMembershipLifecycle(database);
      await database.applyMigration("20261007001000_read_public_admission_overview.sql");
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        const cookie = async (actor: typeof fixture.leader) => `better-auth.session_token=${encodeURIComponent(`${actor.sessionToken}.${await makeSignature(actor.sessionToken, secret)}`)}`;
        const send = async (body: unknown, actor?: typeof fixture.leader, recovery = false) => fetch(`${origin}/api/tribes/${fixture.slug}/membership${recovery ? "/recover" : ""}`, { method: "POST", headers: { origin, "content-type": "application/json", ...(actor ? { cookie: await cookie(actor) } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
        const block = { operationId: randomUUID().toUpperCase(), memberId: fixture.memberIds.applicant.toUpperCase(), action: "block", expectedStatus: "removed", confirmed: true };
        const anonymous = await send(block); expect(anonymous.status).toBe(401); expect(await anonymous.json()).toMatchObject({ code: "authentication_required" });
        const forged = await send({ ...block, role: "leader", paid: true }, fixture.applicant); expect(forged.status).toBe(400);
        const unauthorized = await send({ ...block, operationId: randomUUID(), memberId: fixture.memberIds.leaving, expectedStatus: "muted" }, fixture.applicant);
        expect(unauthorized.status).toBe(200); expect(await unauthorized.json()).toMatchObject({ state: "completed", result: { outcome: "denied", code: "permission_denied" } });
        const blocked = await send(block, fixture.leader); expect(blocked.status).toBe(200);
        const original = await blocked.json(); expect(original).toMatchObject({ state: "completed", operationId: block.operationId.toLowerCase(), result: { outcome: "changed", memberId: fixture.memberIds.applicant, action: "block", status: "blocked" } });
        const replay = await send(block, fixture.leader); expect(await replay.json()).toMatchObject({ ...original, replayed: true });
        const recovered = await send(block, fixture.leader, true); expect(await recovered.json()).toMatchObject({ original: { ...original, replayed: true } });
        const leave = { operationId: randomUUID(), memberId: fixture.memberIds.leaving, action: "leave", expectedStatus: "muted", confirmed: true };
        const leaving = await send(leave, fixture.leaving); expect(leaving.status).toBe(200); expect(await leaving.json()).toMatchObject({ state: "completed", result: { outcome: "changed", deleted: true } });
        const afterLeave = await send(leave, fixture.leaving, true); expect(afterLeave.status).toBe(200); expect(await afterLeave.json()).toMatchObject({ original: { state: "completed", result: { outcome: "changed", deleted: true } } });
        const closure = await database.withContext({ userId: fixture.leader.userId, email: fixture.leader.email }, async (transaction) => (await transaction.execute<{status: string;cancel_reason: string;decisions: number;left_members: number}>(sql`select request.status,request.cancel_reason,(select count(*)::integer from public.academy_admission_decisions where request_id=request.id) as decisions,(select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.leaving.userId}) as left_members from public.academy_admission_requests request where id=${fixture.requestId}`)).rows[0]);
        expect(closure).toEqual({ status: "cancelled", cancel_reason: "nonrecoverable_membership", decisions: 1, left_members: 0 });
      }));
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);
});
