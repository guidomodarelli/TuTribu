/** @vitest-environment node */
/** Exercises a legitimately redeemed and bound personal pending after its required list entry is withdrawn. @module personal-required-list-pending-review-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { mapAdmissionReviewStorage, type AdmissionReviewStorageRecord } from "@/src/modules/academy-admissions/infrastructure/repositories/admission-review-storage-mapper";
import { projectAdmissionReview } from "@/src/modules/academy-admissions/application/results/admission-review-projection";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native required-list personal pending review", () => {
  it("should deny approval after disabling a required entry for a redeemed and bound personal pending despite common exceptions", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      const recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const listed = await fixture.writer.create({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry), operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, displayName: null });
      if (listed.state !== "completed") throw new Error("Required-list pending fixture did not create its own entry");
      const entryId = listed.result.entryId;
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const created = await invitations.create({ context: { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" }, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Revisión con lista requerida", requiresAllowlist: true, allowlistExemptionAcknowledged: false });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Required-list pending fixture did not issue its own invitation");
      const submitted = await recipient.commands.submit.execute({ ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Required-list pending fixture did not redeem its original invitation");
      const requestId = submitted.value.result.admissionRequestId;
      /** @returns The real guarded reviewer projection for the same bound personal source and current list. */
      const readReview = () => database.withContext(fixture.own, async (transaction) => {
        const stored = (await transaction.execute<{ record: AdmissionReviewStorageRecord }>(sql`select record from public.read_admission_reviews(${fixture.tribeId},${fixture.sessionId},${requestId},1)`)).rows[0];
        if (!stored) throw new Error("Required-list pending fixture lost its authorized review projection");
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        return projectAdmissionReview(mapAdmissionReviewStorage(stored.record, now, fixture.config.recoveryLocked));
      });
      expect((await readReview()).eligibleActions).toContain("approve");
      const before = await database.withContext(fixture.own, async (transaction) => {
        const request = (await transaction.execute(sql`select id,status,version,source,requires_allowlist,invitation_id,binding_id,submitted_at,expires_at from public.academy_admission_requests where id=${requestId}`)).rows[0];
        expect(request).toMatchObject({ status: "pending", version: 2, source: "personal", requires_allowlist: true, invitation_id: created.result.invitationId, binding_id: expect.any(String) });
        expect((await transaction.execute(sql`select status,redeemed_request_id,redeemed_by_user_id from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows[0]).toMatchObject({ status: "redeemed", redeemed_request_id: requestId, redeemed_by_user_id: recipient.userId });
        expect((await transaction.execute(sql`select allow_common_exceptions from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows[0]).toEqual({ allow_common_exceptions: true });
        return request;
      });
      expect(await fixture.writer.update({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, entryId), entryId, operationId: randomUUID(), confirmed: true, expectedVersion: 1, patch: { status: "disabled" } })).toMatchObject({ state: "completed" });
      expect(await readReview()).toMatchObject({ eligibilityReasons: ["allowlist_requirement_unmet"], eligibleActions: ["reject"] });
      expect(await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: 2, confirmed: true, decision: "approve", internalReason: "Excepción común no sustituye la lista nominativa", externalMessage: null })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,status,version,source,requires_allowlist,invitation_id,binding_id,submitted_at,expires_at from public.academy_admission_requests where id=${requestId}`)).rows[0]).toEqual(before);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${entryId}`)).rows[0]).toEqual({ status: "disabled", version: 2 });
        const effects = (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${requestId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}) as memberships,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}) as bindings`)).rows[0];
        expect(effects).toEqual({ decisions: 0, memberships: 0, bindings: 1 });
      });
    });
  }, 1_200_000);
});
