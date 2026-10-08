/** Shares real synthetic issuance/ledger/Web Crypto fixtures without a provider request. @module contact-verification-issuance-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresContactVerificationIssuer } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-issuer";
import { PostgresVerificationRequestBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { createVerificationCodeEnvelope } from "@/src/modules/messaging/infrastructure/encryption/verification-code-envelope";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";

/** Validates the actual public snapshot atomically persisted by the real operation ledger. */
export const contactVerificationIssuanceSnapshotSchema = z.union([
  z.strictObject({ outcome: z.literal("issued"), challengeId: z.uuid(), deliveryId: z.uuid(), diagnosticId: z.uuid().nullable(), expiresAt: z.iso.datetime(), resendAllowedAt: z.iso.datetime() }),
  z.strictObject({ outcome: z.literal("denied"), code: z.enum(Object.values(ADMISSION_ERROR_CODE)) }),
]);

/**
 * Seeds immutable resources initially prepared with synthetic encrypted credentials and canonical leadership.
 * @param database - Owned disposable branch with real migrations and guarded transactions.
 * @param purpose - Admission or candidate diagnostic with its distinct preparation requirements.
 * @param phone - Whether to seed the SMS/phone resource instead of the mail resource.
 * @param emailSenderId - Synthetic sender fixed when the immutable version is inserted.
 * @returns The real ledger/issuer flow and synthetic private account/security scope.
 */
export async function prepareContactVerificationIssuer(database: AcademyAdmissionTestDatabase, purpose: VerificationChallengeScope["purpose"] = "admission", phone = false, emailSenderId = "synthetic-email-sender") {
  const fixture = await prepareContactVerificationDatabase(database);
  await database.applyMigration("20261007231500_bind_verification_operation_purpose.sql");
  await database.applyMigration("20261005101000_guard_admission_operation_identity.sql");
  await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
  const tribeId = randomUUID(), connectionId = randomUUID(), secretRef = randomUUID(),credential=randomUUID();
  const scope: VerificationChallengeScope = { userId: fixture.userId, tribeId, connectionId, connectionVersion: 1, securityEpoch: fixture.config.securityEpoch, purpose, verificationEpoch: purpose === "admission" ? 1 : null, channel: phone ? "sms" : "email", contact: phone ? { type: "phone", value: "+5491155501234", country: "AR" } : { type: "email", value: fixture.own.email } };
  const diagnostic = purpose === "connection_diagnostic";
  await database.withContext(fixture.own, async (transaction) => {
    const envelope = await createMessagingSecretCipher(fixture.config).seal(credential, { tribeId, connectionId, connectionVersion: 1, resourceId: secretRef });
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic issuing tribe',${`issue-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${tribeId})`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version) values (${connectionId},${tribeId},${fixture.userId},${diagnostic ? "draft" : "active"},${fixture.config.environment},${scope.securityEpoch},${!diagnostic},${diagnostic},${diagnostic ? null : 1},${diagnostic ? 1 : null})`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,email_sender_id,sms_sender_id,whatsapp_sender_id,whatsapp_template_id,whatsapp_template_language,credential_validation_status,credential_validated_at,is_test_mode) values (${connectionId},${tribeId},1,${fixture.config.environment},${scope.securityEpoch},${secretRef},${emailSenderId},'synthetic-sms-sender',${phone ? "synthetic-whatsapp-sender" : null},${phone ? "synthetic-otp-template" : null},${phone ? "es" : null},'valid',clock_timestamp(),${diagnostic})`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${tribeId},${connectionId},1,${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
    await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,state,checked_at,tested_at) values (${tribeId},${connectionId},1,${scope.channel},${phone ? "synthetic-sms-sender" : emailSenderId},${diagnostic ? "unprepared" : "prepared"},clock_timestamp(),${diagnostic ? null : new Date()})`);
  });
  const authorize = async (transaction: RequestDatabase) => Boolean((await transaction.execute(sql`select id from public.tribes where id=${tribeId} for share`)).rows[0]);
  const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), authorize, async () => fixture.config);
  const issue = (expectedCurrentChallengeId: string | null = null, operationId = randomUUID(), readConfig = async () => fixture.config, beforeIssue = async (_transaction: RequestDatabase) => {}) => {
    const command = { actorUserId: fixture.userId, tribeId, operationType: expectedCurrentChallengeId === null ? VERIFICATION_ISSUANCE_OPERATION.issue : VERIFICATION_ISSUANCE_OPERATION.resend, idempotencyKey: operationId, intent: { expectedCurrentChallengeId, contact: scope.contact.value, channel: scope.channel, purpose, connectionId, connectionVersion: 1 } };
    return ledger.run(command, contactVerificationIssuanceSnapshotSchema, async (transaction, ledgerId) => {
      await beforeIssue(transaction);
      const contacts = new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config);
      const budget = new PostgresVerificationRequestBudget(transaction, async () => true, contacts);
      const result = await new PostgresContactVerificationIssuer(transaction, authorize, readConfig, budget).issue({ scope, operationId, ledgerId, expectedCurrentChallengeId });
      return result.outcome === "issued" ? { ...result, expiresAt: result.expiresAt.toISOString(), resendAllowedAt: result.resendAllowedAt.toISOString() } : result;
    });
  };
  return { ...fixture, scope, issue, ledger,credential,emailSenderId };
}

/**
 * Opens test-only persisted material using real AES and its original immutable challenge dates.
 * @param database - Owned branch containing the newly issued protected code.
 * @param fixture - Exact synthetic owner/security scope used to issue the challenge.
 * @param challengeId - Original challenge whose envelope is still current.
 * @returns The synthetic code and original context, used to exercise the actual validator.
 */
export async function recoverTestVerificationCode(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareContactVerificationIssuer>>, challengeId: string) {
  return database.withContext(fixture.own, async (transaction) => {
    const row = (await transaction.execute<{ id: string; delivery_id: string; created_at: string; expires_at: string; environment: string; security_epoch: string; key_id: string; iv: Uint8Array; ciphertext: Uint8Array }>(sql`select challenge.id,challenge.delivery_id,challenge.created_at,challenge.expires_at,envelope.environment,envelope.security_epoch,envelope.key_id,envelope.iv,envelope.ciphertext from public.contact_verification_challenges challenge inner join public.verification_code_envelopes envelope on envelope.id=challenge.code_envelope_id where challenge.id=${challengeId}`)).rows[0];
    const context = { ...fixture.scope, challengeId, createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at) };
    const code = await createVerificationCodeEnvelope(fixture.config).open({ format: 1, purpose: "otp_envelope", environment: row.environment, securityEpoch: row.security_epoch, keyId: row.key_id, iv: row.iv, ciphertext: row.ciphertext }, context, new Date());
    return { code, context };
  });
}

/**
 * Deliberately places the original request event outside the cooldown without sleeping for a minute.
 * @param database - Owned branch containing only this test's synthetic request events.
 * @param fixture - Exact tenant whose event time is adjusted; challenge dates remain immutable.
 * @returns Nothing after committing the deliberate cooldown fixture.
 */
export async function advanceVerificationRequestCooldown(database: AcademyAdmissionTestDatabase, fixture: Pick<Awaited<ReturnType<typeof prepareContactVerificationIssuer>>,"scope"|"own">) {
  await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_events set occurred_at=clock_timestamp()-interval '2 minutes' where tribe_id=${fixture.scope.tribeId} and event_type='code_request'`));
}
