/** @vitest-environment node */
/** Exercises historical invitation attribution through actual common admission rules and native composition. @module legacy-admission-submission-tests */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_REQUEST_SOURCE, ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { PostgresTribeInvitationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-invitation-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { LEGACY_ADMISSION_LIST_POLICY_VERSION, LEGACY_ADMISSION_MANUAL_POLICY_VERSION, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS, LEGACY_ADMISSION_TOKEN_BYTE_LENGTH } from "@/tests/support/constants/legacy-admission-entry";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native historical invitation admission", () => {
  it("should apply the common manual policy to a genuine historical invitation without granting membership or consuming its attribution", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant, leader } = await prepareAllowlistAdmission(database);
      await database.applyMigration("20261011143000_read_locked_legacy_admission_arrival.sql");
      const recipient = await applicant(false), invitationId = randomUUID(), legacyToken = randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url");
      const tokenHash = createHash("sha256").update(legacyToken).digest("hex");
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set mode=${ADMISSION_POLICY_MODE.manualReview},version=version+1 where tribe_id=${fixture.tribeId}`);
        await transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,created_at) values (${invitationId},${fixture.tribeId},${tokenHash},${fixture.userId},${TRIBE_INVITATION_STATUS.active},clock_timestamp())`);
      });
      const intent = { ...recipient.input, expectedPolicyVersion: LEGACY_ADMISSION_MANUAL_POLICY_VERSION, legacyInvitationToken: legacyToken };
      const slug = (await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ slug: string }>(sql`select slug from public.tribes where id=${fixture.tribeId}`)).rows[0])).slug;
      const oldEntry = new PostgresTribeInvitationRepository((run) => database.withContext({ userId: recipient.userId, email: recipient.email }, run));
      expect(await oldEntry.accept({ tribeSlug: slug, token: legacyToken })).toEqual({ status: TRIBE_INVITATION_STATUS.admissionRequired });
      const outcome = await recipient.commands.submit.execute(intent);
      expect(outcome).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: ADMISSION_OUTCOME.pending, created: true, membership: null, requestSnapshot: { source: ADMISSION_REQUEST_SOURCE.legacy, status: ADMISSION_REQUEST_STATUS.pending } } } });
      if (!outcome.ok || outcome.value.state !== "completed" || !outcome.value.result.admissionRequestId) throw new Error("LegacyAdmissionSubmissionTest: expected original pending result from common manual policy");
      const admissionRequestId = outcome.value.result.admissionRequestId;
      const persisted = await database.withContext(fixture.own, async (transaction) => ({
        requests: (await transaction.execute(sql`select id,source,legacy_invitation_id,status from public.academy_admission_requests where id=${admissionRequestId}`)).rows,
        membership: (await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows,
        invitation: (await transaction.execute(sql`select id,status,revoked_at from public.tribe_invitations where id=${invitationId}`)).rows,
      }));
      expect(persisted.requests).toEqual([{ id: admissionRequestId, source: ADMISSION_REQUEST_SOURCE.legacy, legacy_invitation_id: invitationId, status: ADMISSION_REQUEST_STATUS.pending }]);
      expect(persisted.membership).toEqual([]);
      expect(persisted.invitation).toEqual([{ id: invitationId, status: TRIBE_INVITATION_STATUS.active, revoked_at: null }]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_invitations set status=${TRIBE_INVITATION_STATUS.revoked},revoked_at=clock_timestamp() where id=${invitationId}`));
      const existingPending = await recipient.commands.submit.execute({ ...intent, operationId: randomUUID(), legacyInvitationToken: "unknown-arrival" });
      expect(existingPending).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: ADMISSION_OUTCOME.pending, created: false, admissionRequestId, requestSnapshot: { source: ADMISSION_REQUEST_SOURCE.legacy, status: ADMISSION_REQUEST_STATUS.pending } } } });
      const replay = await recipient.commands.submit.execute(intent);
      expect(replay).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: { admissionRequestId } } });
      const approved = await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId, expectedVersion: outcome.value.result.requestSnapshot!.version, confirmed: true, decision: "approve", internalReason: "Ingreso revisado por el responsable.", externalMessage: null });
      expect(approved).toMatchObject({ ok: true, value: { state: "completed", result: { status: ADMISSION_REQUEST_STATUS.approved } } });
      expect(await oldEntry.accept({ tribeSlug: slug, token: "unknown-arrival" })).toEqual({ status: TRIBE_INVITATION_STATUS.accepted });
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);

  it.each([{ trusted: true, outcome: ADMISSION_OUTCOME.admitted }, { trusted: false, outcome: ADMISSION_OUTCOME.pending }])("should apply the common list policy to a historical arrival with trusted=$trusted without granting a personal exemption", async ({ trusted, outcome }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      await database.applyMigration("20261011143000_read_locked_legacy_admission_arrival.sql");
      const recipient = await applicant(trusted), invitationId = randomUUID(), token = randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url");
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      expect(await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, displayName: "Ingreso por lista" })).toMatchObject({ state: "completed" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,created_at) values (${invitationId},${fixture.tribeId},${createHash("sha256").update(token).digest("hex")},${fixture.userId},${TRIBE_INVITATION_STATUS.active},clock_timestamp())`));
      const input = { ...recipient.input, expectedPolicyVersion: LEGACY_ADMISSION_LIST_POLICY_VERSION, legacyInvitationToken: token, message: "Solicito que revisen este ingreso." };
      const result = await recipient.commands.submit.execute(input);
      expect(result).toMatchObject({ ok: true, value: { state: "completed", result: { outcome, admissionRequestId: expect.any(String) } } });
      if (!result.ok || result.value.state !== "completed") throw new Error("LegacyAdmissionSubmissionTest: expected common list outcome");
      if (!trusted) expect(result.value.result.requestSnapshot?.source).toBe(ADMISSION_REQUEST_SOURCE.legacy);
      expect(await recipient.commands.submit.execute(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,legacy_invitation_id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ status: trusted ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.pending, legacy_invitation_id: invitationId }]);
        expect((await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows[0].count).toBe(trusted ? 1 : 0);
        expect((await transaction.execute(sql`select status,revoked_at from public.tribe_invitations where id=${invitationId}`)).rows).toEqual([{ status: TRIBE_INVITATION_STATUS.active, revoked_at: null }]);
      });
    });
  }, LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS);
});
