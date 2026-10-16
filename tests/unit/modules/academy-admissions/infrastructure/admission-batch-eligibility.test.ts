/** @vitest-environment node */
/** Exercises native batch exception reasons, current list authority and redeemed nominative restrictions. @module admission-batch-eligibility-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatchEligibility } from "@/tests/support/admission-batch-eligibility-fixture";
import { ADMISSION_BATCH_ELIGIBILITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-batch-validation";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission batch current eligibility", () => {
  it("should require a reason for exception approval and rejection and preserve declared identity when a reasoned batch is confirmed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given a real common exception with declared contact and no independent list entry.
      const prepared = await prepareAdmissionBatchEligibility(database), { fixture, leader } = prepared;
      const applicant = await prepared.applicant(false), selected = await prepared.submitCommon(applicant);
      const input = {
        tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true as const,
        decision: "approve" as const, internalReason: "   ", externalMessage: null, items: [selected],
      };

      // When either decision omits its reason, every row is a confirmed denial without a membership effect.
      for (const decision of ["approve", "reject"] as const) {
        expect(await leader.decideBatch.execute({ ...input, operationId: randomUUID(), decision })).toMatchObject({
          ok: true, value: { state: "completed", result: "all_rejected", completedCount: 0, failedCount: 1, unresolvedCount: 0,
            items: [{ requestId: selected.admissionRequestId, status: "denied", code: "invalid_input" }] },
        });
      }
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,evidence_source,binding_id from public.academy_admission_requests where id=${selected.admissionRequestId}`)).rows).toEqual([{ status: "pending", version: selected.expectedVersion, evidence_source: "declared", binding_id: null }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_decisions where request_id=${selected.admissionRequestId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual([{ count: 0 }]);
      });
      const reasoned = { ...input, internalReason: "Acepto esta excepción después de revisarla.", externalMessage: "Tu solicitud fue aprobada." };
      const approved = await leader.decideBatch.execute(reasoned);

      // Then approval retains its separate notes and never creates list authority or trusted contact evidence.
      expect(approved).toMatchObject({ ok: true, value: { state: "completed", result: "all_succeeded", completedCount: 1, failedCount: 0, unresolvedCount: 0, items: [{ requestId: selected.admissionRequestId, status: "approved", version: selected.expectedVersion + 1 }] } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select internal_reason,external_message,evidence_snapshot from public.academy_admission_decisions where request_id=${selected.admissionRequestId}`)).rows).toEqual([{ internal_reason: reasoned.internalReason, external_message: reasoned.externalMessage, evidence_snapshot: { kind: "declared", referenceId: null, verifiedAt: null } }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}) as entries,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${applicant.userId}) as bindings,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as memberships`)).rows).toEqual([{ entries: 0, bindings: 0, memberships: 1 }]);
      });
      if (!approved.ok) throw new Error("Reasoned native exception batch did not complete");
      expect(approved.value).not.toHaveProperty("internalReason");
      expect(approved.value).not.toHaveProperty("externalMessage");
      expect(await leader.decideBatch.execute(reasoned)).toEqual(approved);
    });
  }, ADMISSION_BATCH_ELIGIBILITY_TEST_TIMEOUT_MS);

  it("should use the current enabled list after exceptions are disabled and retain a withdrawn row as a terminal per-row denial", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given two genuine pending exceptions that acquire independent list entries later.
      const prepared = await prepareAdmissionBatchEligibility(database), { fixture, leader } = prepared;
      const allowed = await prepared.applicant(), withdrawn = await prepared.applicant(), hidden = await prepared.applicant();
      const allowedRequest = await prepared.submitCommon(allowed), withdrawnRequest = await prepared.submitCommon(withdrawn), hiddenRequest = await prepared.submitCommon(hidden);
      const allowedEntry = await prepared.createEntry(allowed), withdrawnEntry = await prepared.createEntry(withdrawn);
      await fixture.writer.update({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, withdrawnEntry.entryId), entryId: withdrawnEntry.entryId, operationId: randomUUID(), confirmed: true, expectedVersion: withdrawnEntry.version, patch: { status: "disabled" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      const input = {
        tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true as const, decision: "approve" as const,
        internalReason: "Revisión con la lista vigente, sin excepción habilitada.", externalMessage: null, items: [withdrawnRequest, allowedRequest],
      };

      // When one real atomic owner revalidates the explicit selection, only the current allowed contact is approved.
      const result = await leader.decideBatch.execute(input);

      // Then the expected denial is terminal, the hidden request is untouched and neither list entry is edited.
      expect(result).toMatchObject({ ok: true, value: { state: "completed", result: "mixed", completedCount: 1, failedCount: 1, unresolvedCount: 0, items: [
        { requestId: withdrawnRequest.admissionRequestId, status: "denied", code: "admission_ineligible" },
        { requestId: allowedRequest.admissionRequestId, status: "approved", version: allowedRequest.expectedVersion + 1 },
      ] } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,status,version from public.academy_allowlist_entries where tribe_id=${fixture.tribeId} order by id`)).rows).toEqual(expect.arrayContaining([
          { id: allowedEntry.entryId, status: "enabled", version: allowedEntry.version },
          { id: withdrawnEntry.entryId, status: "disabled", version: withdrawnEntry.version + 1 },
        ]));
        expect((await transaction.execute(sql`select outcome,actor_user_id,internal_reason from public.academy_admission_decisions where request_id=${allowedRequest.admissionRequestId}`)).rows).toEqual([{ outcome: "approved", actor_user_id: fixture.userId, internal_reason: input.internalReason }]);
        expect((await transaction.execute(sql`select id,status,version from public.academy_admission_requests where id=any(${sql.param([withdrawnRequest.admissionRequestId, hiddenRequest.admissionRequestId])}::uuid[])`)).rows).toEqual(expect.arrayContaining([
          { id: withdrawnRequest.admissionRequestId, status: "pending", version: withdrawnRequest.expectedVersion },
          { id: hiddenRequest.admissionRequestId, status: "pending", version: hiddenRequest.expectedVersion },
        ]));
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}) as memberships,(select count(*)::int from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} and event_type='approved') as approvals`)).rows).toEqual([{ decisions: 1, memberships: 1, approvals: 1 }]);
      });
      if (!result.ok) throw new Error("Current-list native batch did not complete");
      expect(await leader.decideBatch.execute(input)).toEqual(result);
    });
  }, ADMISSION_BATCH_ELIGIBILITY_TEST_TIMEOUT_MS);

  it("should preserve mandatory list and recipient authority for genuine redeemed invitations when common exceptions remain allowed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given redeemed and bound manual pendings, with required-list and exempt invitations kept distinct.
      const prepared = await prepareAdmissionBatchEligibility(database), { fixture, leader } = prepared;
      const policyVersion = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ version: number }>(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId} returning version`)).rows[0].version);
      const listed = await prepared.applicant(), withdrawn = await prepared.applicant(), exempt = await prepared.applicant(), revoked = await prepared.applicant(), unproven = await prepared.applicant();
      const listedEntry = await prepared.createEntry(listed), withdrawnEntry = await prepared.createEntry(withdrawn);
      const listedRequest = await prepared.submitPersonal(listed, true, policyVersion), withdrawnRequest = await prepared.submitPersonal(withdrawn, true, policyVersion);
      const exemptRequest = await prepared.submitPersonal(exempt, false, policyVersion), revokedRequest = await prepared.submitPersonal(revoked, false, policyVersion), unprovenRequest = await prepared.submitPersonal(unproven, false, policyVersion);
      await fixture.writer.update({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, withdrawnEntry.entryId), entryId: withdrawnEntry.entryId, operationId: randomUUID(), confirmed: true, expectedVersion: withdrawnEntry.version, patch: { status: "disabled" } });
      await prepared.invitations.revoke({ context: { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, revokedRequest.invitationId), action: "manage_invitations" }, operationId: randomUUID(), confirmed: true, invitationId: revokedRequest.invitationId, expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: "Retiro la autorización nominativa pendiente." });
      const originalCancellation = await database.withContext(fixture.own, async (transaction) => {
        const request = (await transaction.execute(sql`select id,status,version,decision_id,source,invitation_id,binding_id,submitted_at,expires_at from public.academy_admission_requests where id=${revokedRequest.admissionRequestId}`)).rows[0];
        const decisions = (await transaction.execute(sql`select id,outcome,request_version from public.academy_admission_decisions where request_id=${revokedRequest.admissionRequestId}`)).rows;
        const notices = (await transaction.execute(sql`select id,event_type from public.academy_admission_notification_obligations where request_id=${revokedRequest.admissionRequestId} and event_type='cancelled'`)).rows;
        expect(request).toMatchObject({ id: revokedRequest.admissionRequestId, status: "cancelled", version: revokedRequest.expectedVersion + 1, decision_id: expect.any(String), source: "personal", invitation_id: revokedRequest.invitationId, binding_id: expect.any(String) });
        expect(decisions).toEqual([{ id: request.decision_id, outcome: "cancelled", request_version: revokedRequest.expectedVersion }]);
        expect(notices).toEqual([{ id: expect.any(String), event_type: "cancelled" }]);
        return { request, decisions, notices };
      });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.global_identity_evidence set invalidated_at=clock_timestamp(),invalidation_reason='superseded_capture' where id=${unproven.evidenceId}`));
      const selections = [withdrawnRequest, exemptRequest, revokedRequest, listedRequest, unprovenRequest].map(({ admissionRequestId, expectedVersion }) => ({ admissionRequestId, expectedVersion }));
      const input = {
        tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true as const, decision: "approve" as const,
        internalReason: "La excepción común no reemplaza requisitos nominativos vigentes.", externalMessage: null, items: selections,
      };

      // When the batch revalidates every selected invitation, exemptions remove only their own list requirement.
      const result = await leader.decideBatch.execute(input);

      // Then current approvals and denials preserve the cancellation already committed by revocation.
      expect(result).toMatchObject({ ok: true, value: { state: "completed", result: "mixed", completedCount: 2, failedCount: 3, unresolvedCount: 0, items: [
        { requestId: withdrawnRequest.admissionRequestId, status: "denied", code: "admission_ineligible" },
        { requestId: exemptRequest.admissionRequestId, status: "approved", version: exemptRequest.expectedVersion + 1 },
        { requestId: revokedRequest.admissionRequestId, status: "conflict", code: "request_conflict" },
        { requestId: listedRequest.admissionRequestId, status: "approved", version: listedRequest.expectedVersion + 1 },
        { requestId: unprovenRequest.admissionRequestId, status: "denied", code: "admission_ineligible" },
      ] } });
      expect(await leader.decideBatch.execute(input)).toEqual(result);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select allow_common_exceptions from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ allow_common_exceptions: true }]);
        expect((await transaction.execute(sql`select user_id,role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=any(${sql.param([listed.userId, withdrawn.userId, exempt.userId, revoked.userId, unproven.userId])}::text[])`)).rows).toEqual(expect.arrayContaining([
          { user_id: listed.userId, role: "tribemate", status: "active" }, { user_id: exempt.userId, role: "tribemate", status: "active" },
        ]));
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}) as memberships,(select count(*)::int from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} and event_type='approved') as approvals`)).rows).toEqual([{ decisions: 3, memberships: 2, approvals: 2 }]);
        expect((await transaction.execute(sql`select id,status,version from public.academy_admission_requests where id=any(${sql.param([withdrawnRequest.admissionRequestId, unprovenRequest.admissionRequestId])}::uuid[])`)).rows).toEqual(expect.arrayContaining([
          { id: withdrawnRequest.admissionRequestId, status: "pending", version: withdrawnRequest.expectedVersion },
          { id: unprovenRequest.admissionRequestId, status: "pending", version: unprovenRequest.expectedVersion },
        ]));
        expect((await transaction.execute(sql`select id,status,version,decision_id,source,invitation_id,binding_id,submitted_at,expires_at from public.academy_admission_requests where id=${revokedRequest.admissionRequestId}`)).rows).toEqual([originalCancellation.request]);
        expect((await transaction.execute(sql`select id,outcome,request_version from public.academy_admission_decisions where request_id=${revokedRequest.admissionRequestId}`)).rows).toEqual(originalCancellation.decisions);
        expect((await transaction.execute(sql`select id,event_type from public.academy_admission_notification_obligations where request_id=${revokedRequest.admissionRequestId} and event_type='cancelled'`)).rows).toEqual(originalCancellation.notices);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${listedEntry.entryId}`)).rows).toEqual([{ status: "enabled", version: listedEntry.version }]);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${withdrawnEntry.entryId}`)).rows).toEqual([{ status: "disabled", version: withdrawnEntry.version + 1 }]);
      });
    });
  }, ADMISSION_BATCH_ELIGIBILITY_TEST_TIMEOUT_MS);
});
