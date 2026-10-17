/** @vitest-environment node */
/** Exercises declared-number storage, ownership, replay, review and retention on real owned PostgreSQL branches. @module admission-whatsapp-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatch } from "@/tests/support/admission-batch-database-fixture";
import { prepareAdmissionPrivateRetention } from "@/tests/support/admission-private-retention-fixture";
import { ADMISSION_WHATSAPP_SQL_TIMEOUT_MS } from "@/tests/support/constants/admission-whatsapp-number";
import { PostgresOwnAdmissionRequestReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-own-admission-request-reader";
import { PostgresAdmissionReviewReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-review-reader";
import { PostgresAdmissionOperationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-reader";
import { projectAdmissionReview } from "@/src/modules/academy-admissions/application/results/admission-review-projection";
import { admissionOperationRecoveryEnvelopeSchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";

describe.skipIf(process.env.ACADEMY_ADMISSION_SQL_TESTS !== "1")("native declared WhatsApp persistence", () => {
  it("should enforce the current requirement, persist only an own correction and preserve replay, review CAS and private projections", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await prepareAdmissionBatch(database), pending = await data.submitPending(), other = await data.submitPending();
      const scope = { tribeId: data.tribeId, userId: pending.applicantId, sessionId: pending.sessionId, requestId: randomUUID() };
      const snapshot = () => database.withContext(data.own, async (transaction) => (await transaction.execute(sql`select contact_type,normalized_contact,evidence_source,proof_id,binding_id,status,version,submitted_at,expires_at,whatsapp_number from public.academy_admission_requests where id=${pending.admissionRequestId}`)).rows[0]);
      const before = await snapshot();
      expect(before).toMatchObject({ whatsapp_number: null, status: "pending", version: 1 });
      await database.withContext(data.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_whatsapp_number=true,version=version+1 where tribe_id=${data.tribeId}`));
      const own = new PostgresOwnAdmissionRequestReader((current, run) => database.withContext({ userId: current.userId, email: null }, run), async () => false);
      expect(await own.readOwn(scope)).toMatchObject({ id: pending.admissionRequestId, whatsappNumber: null, requiresWhatsappNumber: true, eligibilityReasons: ["whatsapp_number_required"] });
      const decision = { ...data.scope, operationId: randomUUID(), type: "decide_admission_request" as const, admissionRequestId: pending.admissionRequestId, expectedVersion: 1, decision: "approve" as const, internalReason: "Synthetic group comparison", externalMessage: null, confirmed: true as const };
      await expect(data.writer.decide(decision)).rejects.toMatchObject({ code: "admission_ineligible" });
      const intent = { ...scope, admissionRequestId: pending.admissionRequestId, operationId: randomUUID(), expectedVersion: 1, confirmed: true as const, whatsappNumber: "+14155552671" };
      data.loseNextCommittedReply();
      expect(await data.writer.updateWhatsappNumber(intent)).toMatchObject({ state: "completed", result: { admissionRequestId: pending.admissionRequestId, version: 2, changed: true } });
      expect(await data.writer.updateWhatsappNumber(intent)).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      expect(await snapshot()).toEqual({ ...before, whatsapp_number: intent.whatsappNumber, version: 2 });
      await expect(data.writer.updateWhatsappNumber({ ...intent, whatsappNumber: "+442079460018" })).rejects.toMatchObject({ code: "idempotency_conflict" });
      expect(await data.writer.updateWhatsappNumber({ ...intent, operationId: randomUUID(), expectedVersion: 2 })).toMatchObject({ state: "completed", result: { version: 2, changed: false } });
      await expect(data.writer.updateWhatsappNumber({ ...intent, operationId: randomUUID(), expectedVersion: 2, whatsappNumber: null })).rejects.toMatchObject({ code: "whatsapp_number_required" });
      await expect(data.writer.updateWhatsappNumber({ ...intent, operationId: randomUUID(), userId: other.applicantId, sessionId: other.sessionId })).rejects.toMatchObject({ code: "permission_denied" });
      await expect(data.writer.updateWhatsappNumber({ ...intent, operationId: randomUUID(), userId: data.userId, sessionId: data.sessionId })).rejects.toMatchObject({ code: "permission_denied" });
      const reviewer = new PostgresAdmissionReviewReader((current, run) => database.withContext({ userId: current.userId, email: null }, run), async () => false);
      const record = await reviewer.readDetail(data.scope, pending.admissionRequestId);
      if (!record) throw new Error("Owned synthetic review unavailable");
      expect(projectAdmissionReview(record)).toMatchObject({ applicant: { name: "Synthetic batch applicant" }, whatsappNumber: intent.whatsappNumber, eligibleActions: ["reject", "approve"] });
      const operation = await new PostgresAdmissionOperationReader((current, run) => database.withContext({ userId: current.userId, email: null }, run)).read(scope, intent.operationId);
      expect(admissionOperationRecoveryEnvelopeSchema.parse(operation)).toMatchObject({ operationType: "update_admission_whatsapp", operation: { state: "completed", result: { version: 2 } } });
      expect(JSON.stringify(operation)).not.toContain(intent.whatsappNumber);
      const audit = await database.withContext(data.own, async (transaction) => (await transaction.execute(sql`select event_type,resource_version,metadata from public.academy_admission_audit_events where resource_id=${pending.admissionRequestId} and event_type='whatsapp_number_changed'`)).rows);
      expect(audit).toEqual([{ event_type: "whatsapp_number_changed", resource_version: 2, metadata: expect.objectContaining({ previousVersion: 1, fromStatus: "pending", toStatus: "pending" }) }]);
      expect(JSON.stringify(audit)).not.toContain(intent.whatsappNumber);
      await expect(data.writer.decide({ ...decision, operationId: randomUUID() })).rejects.toMatchObject({ code: "request_conflict" });
      expect(await data.writer.decide({ ...decision, operationId: randomUUID(), expectedVersion: 2 })).toMatchObject({ state: "completed", result: { status: "approved", version: 3 } });
      expect(await data.writer.updateWhatsappNumber(intent)).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      await expect(data.writer.updateWhatsappNumber({ ...intent, operationId: randomUUID(), expectedVersion: 3, whatsappNumber: "+442079460018" })).rejects.toMatchObject({ code: "request_conflict" });
      const otherScope = { ...scope, userId: other.applicantId, sessionId: other.sessionId };
      const otherEdit = { ...otherScope, admissionRequestId: other.admissionRequestId, operationId: randomUUID(), expectedVersion: 1, confirmed: true as const, whatsappNumber: "+14155552671" };
      const otherDecision = { ...decision, admissionRequestId: other.admissionRequestId, operationId: randomUUID(), expectedVersion: 1 };
      const [requiredEdit, incompleteApproval] = await Promise.allSettled([data.writer.updateWhatsappNumber(otherEdit), data.writer.decide(otherDecision)]);
      expect(requiredEdit).toMatchObject({ status: "fulfilled", value: { state: "completed", result: { version: 2, changed: true } } });
      expect(incompleteApproval.status).toBe("rejected");
      if (incompleteApproval.status !== "rejected") throw new Error("Incomplete concurrent approval unexpectedly committed");
      expect(["request_conflict", "admission_ineligible"]).toContain(incompleteApproval.reason.code);
      await database.withContext(data.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_whatsapp_number=false,version=version+1 where tribe_id=${data.tribeId}`));
      const [edited, approved] = await Promise.allSettled([
        data.writer.updateWhatsappNumber({ ...otherEdit, operationId: randomUUID(), expectedVersion: 2, whatsappNumber: "+442079460018" }),
        data.writer.decide({ ...otherDecision, operationId: randomUUID(), expectedVersion: 2 }),
      ]);
      expect([edited, approved].filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const otherState = await database.withContext(data.own, async (transaction) => (await transaction.execute(sql`select status,version,whatsapp_number,(select count(*)::int from public.tribe_members where tribe_id=${data.tribeId} and user_id=${other.applicantId}) as memberships from public.academy_admission_requests where id=${other.admissionRequestId}`)).rows[0]);
      if (edited.status === "fulfilled") {
        expect(edited.value).toMatchObject({ state: "completed", result: { version: 3, changed: true } });
        expect(approved).toMatchObject({ status: "rejected", reason: { code: "request_conflict" } });
        expect(otherState).toEqual({ status: "pending", version: 3, whatsapp_number: "+442079460018", memberships: 0 });
      } else {
        expect(edited).toMatchObject({ status: "rejected", reason: { code: "request_conflict" } });
        expect(approved).toMatchObject({ status: "fulfilled", value: { state: "completed", result: { status: "approved", version: 3 } } });
        expect(otherState).toEqual({ status: "approved", version: 3, whatsapp_number: "+14155552671", memberships: 1 });
      }
      expect(await database.withContext(data.own, async (transaction) => (await transaction.execute(sql`select verification_epoch,(select count(*)::int from public.message_deliveries where tribe_id=${data.tribeId}) as deliveries,(select count(*)::int from public.tribe_members where tribe_id=${data.tribeId} and user_id=${pending.applicantId} and role='tribemate') as memberships from public.academy_admission_policies where tribe_id=${data.tribeId}`)).rows)).toEqual([{ verification_epoch: 1, deliveries: 0, memberships: 1 }]);
    });
  }, ADMISSION_WHATSAPP_SQL_TIMEOUT_MS);

  it("should minimize aged terminal declared numbers while preserving fresh or pending data and original business versions", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const number = "+14155552671", data = await prepareAdmissionPrivateRetention(database, undefined, number);
      const read = () => database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ id: string; version: number; whatsapp_number: string | null }>(sql`select id,version,whatsapp_number from public.academy_admission_requests where tribe_id=${data.tribeId} order by id`)).rows);
      const before = await read();
      expect(before).toHaveLength(4);
      expect(before.every((request) => request.whatsapp_number === number)).toBe(true);
      expect(await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute(sql`select public.minimize_terminal_admission_requests(100) as minimized`)).rows)).toEqual([{ minimized: 2 }]);
      const minimizedIds = new Set<string>([data.oldRequestId, data.unboundRequestId]);
      expect(await read()).toEqual(before.map((request) => ({ ...request, whatsapp_number: minimizedIds.has(request.id) ? null : number })));
      await expect(database.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql`update public.academy_admission_requests set whatsapp_number=${number},version=version+1 where id=${data.oldRequestId}`))).rejects.toBeDefined();
      expect(await read()).toEqual(before.map((request) => ({ ...request, whatsapp_number: minimizedIds.has(request.id) ? null : number })));
    });
  }, ADMISSION_WHATSAPP_SQL_TIMEOUT_MS);
});
