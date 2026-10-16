/** Submits genuine common and redeemed personal requests for current batch eligibility checks. @module admission-batch-eligibility-fixture */
import { randomUUID } from "node:crypto";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAllowlistAdmission } from "./allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Retains the native account, captured evidence and real command composition owned by the existing fixture. */
type NativeBatchApplicant = Awaited<ReturnType<Awaited<ReturnType<typeof prepareAllowlistAdmission>>["applicant"]>>;

/**
 * Prepares real eligibility sources without seeding a redeemed invitation or bypassing admission guards.
 * @param database - Verified disposable branch with native PostgreSQL and current migrations.
 * @returns The current list academy, its real batch use case and normal submission helpers.
 */
export async function prepareAdmissionBatchEligibility(database: AcademyAdmissionTestDatabase) {
  const prepared = await prepareAllowlistAdmission(database);
  const { fixture } = prepared;
  await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
  const invitations = new PostgresPersonalInvitationRepository(
    (_context, run) => database.withContext(fixture.own, run),
    async () => fixture.config,
    createPostgresAdmissionNotificationObligationWriter,
  );

  /** @param applicant - Actual native applicant with its independent current session. @returns The original pending selection after a reasoned common presentation. */
  async function submitCommon(applicant: NativeBatchApplicant) {
    const submitted = await applicant.commands.submit.execute({ ...applicant.input, message: "Solicito una revisión de mi ingreso." });
    if (!submitted.ok || submitted.value.state !== "completed" || submitted.value.result.outcome !== "pending" || !submitted.value.result.admissionRequestId || !submitted.value.result.committedRequestVersion) {
      throw new Error("AdmissionBatchEligibilityFixture.submitCommon failed: original_pending_not_created");
    }
    return { admissionRequestId: submitted.value.result.admissionRequestId, expectedVersion: submitted.value.result.committedRequestVersion };
  }

  /** @param applicant - Exact synthetic recipient of the independent list authorization. @returns The real newly created entry identity and original version. */
  async function createEntry(applicant: NativeBatchApplicant) {
    const entry = await fixture.writer.create({
      context: await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry), operationId: randomUUID(), confirmed: true,
      contact: { type: "email", value: applicant.email }, displayName: null,
    });
    if (entry.state !== "completed") throw new Error("AdmissionBatchEligibilityFixture.createEntry failed: entry_not_created");
    return entry.result;
  }

  /**
   * Creates and explicitly redeems the recipient's own single-use invitation into manual review.
   * @param applicant - Real native recipient whose trusted capture proves the invitation contact.
   * @param requiresAllowlist - Whether current list authorization remains mandatory for this invitation.
   * @param expectedPolicyVersion - Current manual policy version read from the owned branch.
   * @returns Only the pending selection and invitation identity; initial material remains private to this helper.
   */
  async function submitPersonal(applicant: NativeBatchApplicant, requiresAllowlist: boolean, expectedPolicyVersion: number) {
    const created = await invitations.create({
      context: { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" },
      operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email },
      internalName: "Revisión nominativa de lote", requiresAllowlist, allowlistExemptionAcknowledged: !requiresAllowlist,
    });
    if (created.state !== "completed" || !created.initialToken) throw new Error("AdmissionBatchEligibilityFixture.submitPersonal failed: initial_invitation_unavailable");
    const submitted = await applicant.commands.submit.execute({ ...applicant.input, expectedPolicyVersion, invitationToken: created.initialToken });
    if (!submitted.ok || submitted.value.state !== "completed" || submitted.value.result.outcome !== "pending" || !submitted.value.result.admissionRequestId || !submitted.value.result.committedRequestVersion) {
      throw new Error("AdmissionBatchEligibilityFixture.submitPersonal failed: redeemed_pending_not_created");
    }
    return { admissionRequestId: submitted.value.result.admissionRequestId, expectedVersion: submitted.value.result.committedRequestVersion, invitationId: created.result.invitationId };
  }

  return { ...prepared, invitations, submitCommon, createEntry, submitPersonal };
}
