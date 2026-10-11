/** @vitest-environment node */
/** Exercises current own eligibility with native account evidence and real readonly projections. @module own-admission-current-eligibility-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresOwnAdmissionRequestReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-own-admission-request-reader";
import { PostgresGlobalIdentityEvidenceRepository } from "@/src/modules/auth/infrastructure/repositories/postgres-global-identity-evidence-repository";
import { admissionRequestSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native own admission current eligibility", () => {
  it("should explain pause and a withdrawn required entry without changing the pending request or gaining reviewer access", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      await database.withContext(fixture.own, async (transaction) => {
        const metadata = await transaction.$client.query<{ available: boolean }>("select to_regprocedure('public.read_own_admission_request_summary(uuid,text,uuid)') is not null as available");
        expect(metadata.rows).toEqual([{ available: false }]);
        await transaction.$client.query("savepoint own_exact_summary_prerequisite");
        try {
          await expect(transaction.$client.query("select * from public.read_own_admission_request_summary($1::uuid,$2::text,$3::uuid)", [fixture.tribeId, fixture.sessionId, randomUUID()])).rejects.toMatchObject({ code: "42883" });
        } finally {
          await transaction.$client.query("rollback to savepoint own_exact_summary_prerequisite");
          await transaction.$client.query("release savepoint own_exact_summary_prerequisite");
        }
      });
      await database.applyMigration("20261007004000_read_exact_own_admission_request.sql");
      const owner = await applicant();
      const submitted = await owner.commands.submit.execute({ ...owner.input, message: "Solicito revisión con mi evidencia actual." });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Own eligibility setup failed: pending_request_unavailable");
      const requestId = submitted.value.result.admissionRequestId;
      const entry = await fixture.writer.create({ context: await fixture.confirm("create_allowlist_entry"), operationId: randomUUID(), confirmed: true, contact: { type: "email", value: owner.email }, displayName: null });
      if (entry.state !== "completed") throw new Error("Own eligibility setup failed: allowlist_entry_unconfirmed");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      const scope = { userId: owner.userId, sessionId: owner.sessionId, tribeId: fixture.tribeId, requestId: randomUUID(), admissionRequestId: requestId };
      const reader = new PostgresOwnAdmissionRequestReader((current, run) => database.withContext({ userId: current.userId, email: owner.email }, run), async () => false);
      const before = admissionRequestSchema.parse(await reader.readOwn(scope));
      expect(before.eligibilityReasons).toEqual([]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      expect(await reader.readOwn(scope)).toMatchObject({ id: requestId, status: "pending", version: before.version, submittedAt: before.submittedAt, expiresAt: before.expiresAt, eligibilityReasons: ["admission_closed"] });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=true,version=version+1 where tribe_id=${fixture.tribeId}`));
      expect((await reader.readOwn(scope))?.eligibilityReasons).toEqual([]);
      expect(await fixture.writer.update({ context: await fixture.confirm("update_allowlist_entry", entry.result.entryId), operationId: randomUUID(), expectedVersion: entry.result.version, confirmed: true, entryId: entry.result.entryId, patch: { status: "disabled" } })).toMatchObject({ state: "completed" });
      const withdrawn = admissionRequestSchema.parse(await reader.readOwn(scope));
      expect(withdrawn).toMatchObject({ id: requestId, status: "pending", version: before.version, submittedAt: before.submittedAt, expiresAt: before.expiresAt, eligibilityReasons: ["allowlist_requirement_unmet"] });
      expect(withdrawn).not.toHaveProperty("internalReason");
      expect(withdrawn).not.toHaveProperty("rawContact");
      expect(JSON.stringify(withdrawn)).not.toContain(owner.email);
      await database.withContext({ userId: owner.userId, email: owner.email }, async (transaction) => {
        expect((await transaction.$client.query<{ allowed: boolean }>("select has_table_privilege(current_user,'public.session','SELECT') as allowed")).rows).toEqual([{ allowed: false }]);
        await transaction.$client.query("savepoint own_session_read_prerequisite");
        try {
          await expect(transaction.$client.query("select clock_timestamp() from public.session where id=$1", [owner.sessionId])).rejects.toMatchObject({ code: "42501" });
        } finally {
          await transaction.$client.query("rollback to savepoint own_session_read_prerequisite");
          await transaction.$client.query("release savepoint own_session_read_prerequisite");
        }
      }, "non_bypass");
      await database.grantTablesToNonBypass(["session"]);
      const restricted = new PostgresOwnAdmissionRequestReader((current, run) => database.withContext({ userId: current.userId, email: owner.email }, run, "non_bypass"), async () => false);
      expect(await restricted.readOwn(scope)).toEqual(withdrawn);
      const outsider = await applicant();
      expect(await reader.readOwn({ ...scope, userId: outsider.userId, sessionId: outsider.sessionId })).toBeNull();
      await database.withContext({ userId: owner.userId, email: owner.email }, async (transaction) => {
        expect((await transaction.execute(sql`select record from public.read_admission_reviews(${fixture.tribeId},${owner.sessionId},${requestId},1)`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_notification_obligations where request_id=${requestId}`)).rows).toEqual([{ count: 1 }]);
      });
    });
  }, 300_000);

  it("should use the original base capture after a new login capture and expose a safe current required-list restriction", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      await database.applyMigration("20261007004000_read_exact_own_admission_request.sql");
      const owner = await applicant();
      const submitted = await owner.commands.submit.execute({ ...owner.input, message: "Solicito revisión con mi captura original." });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Own capture eligibility setup failed: pending_request_unavailable");
      const requestId = submitted.value.result.admissionRequestId;
      expect(await fixture.writer.create({ context: await fixture.confirm("create_allowlist_entry"), operationId: randomUUID(), confirmed: true, contact: { type: "email", value: owner.email }, displayName: null })).toMatchObject({ state: "completed" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      const scope = { userId: owner.userId, sessionId: owner.sessionId, tribeId: fixture.tribeId, requestId: randomUUID(), admissionRequestId: requestId };
      const reader = new PostgresOwnAdmissionRequestReader((current, run) => database.withContext({ userId: current.userId, email: owner.email }, run), async () => false);
      const before = admissionRequestSchema.parse(await reader.readOwn(scope));
      await database.withContext({ userId: owner.userId, email: owner.email }, async (transaction) => {
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        expect(await new PostgresGlobalIdentityEvidenceRepository((run) => run(transaction)).capture({ userId: owner.userId, accountId: owner.accountId, sessionId: owner.sessionId, evidence: { subject: owner.subject, normalizedEmail: owner.email, emailVerifiedClaim: true, hostedDomain: "example.test", classification: "workspace", issuer: "https://accounts.google.com", audience: "synthetic-list-client", tokenIssuedAt: now, tokenExpiresAt: new Date(now.getTime() + 3_600_000) } })).toMatchObject({ status: "stored" });
      });
      const current = admissionRequestSchema.parse(await reader.readOwn(scope));
      expect(current).toMatchObject({ id: requestId, status: "pending", version: before.version, submittedAt: before.submittedAt, expiresAt: before.expiresAt, eligibilityReasons: ["allowlist_requirement_unmet"] });
      expect(current).not.toHaveProperty("identityEvidenceId");
      expect(current).not.toHaveProperty("googleAccount");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select global_identity_evidence_id from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ global_identity_evidence_id: owner.evidenceId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${owner.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 300_000);
});
