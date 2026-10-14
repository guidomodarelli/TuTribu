/** Seeds coherent historical requests and audit in an owned database without changing current clocks or hosting keys. @module admission-private-retention-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { executeAdmissionMigrationCommand } from "./admission-migration-command";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createMessagingSecurityConfig, type MessagingKeyringInput, type MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** @param database - Verified owned branch; both migration URLs remain private and branch-scoped. @param securityConfig - Optional explicit synthetic configuration shared with an earlier migration-stage fixture. @returns Live/retired scopes, an original binding and independently aged request/decision pairs. */
export async function prepareAdmissionPrivateRetention(database: AcademyAdmissionTestDatabase, securityConfig?: MessagingSecurityConfig) {
  await database.withServerEnvironment((environment) => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL }));
  const managerId = randomUUID(), tribeId = randomUUID(), archivedTribeId = randomUUID();
  const boundUserId = randomUUID(), unboundUserId = randomUUID(), freshUserId = randomUUID(), pendingUserId = randomUUID(), sessionId = randomUUID();
  const evidenceId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), bindingId = randomUUID();
  const oldRequestId = randomUUID(), unboundRequestId = randomUUID(), freshRequestId = randomUUID(), pendingRequestId = randomUUID();
  const oldDecisionId = randomUUID(), unboundDecisionId = randomUUID(), freshDecisionId = randomUUID();
  const oldAuditId = randomUUID(), archivedAuditId = randomUUID(), recentAuditId = randomUUID();
  const contact = `${boundUserId}@example.test`;
  /** @returns One independent native fixture key; no hosting or pilot material is read. */
  const keyring = (): MessagingKeyringInput => { const id = randomUUID(); return { activeKeyId: id, keys: [{ id, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] }; };
  const security = securityConfig ?? await createMessagingSecurityConfig({ environment: "synthetic-private-retention", securityEpoch: randomUUID(), recoveryLocked: false, keyrings: { credential: keyring(), otp_envelope: keyring(), verification_mac: keyring(), invitation_token: keyring(), contact_fingerprint: keyring(), operation_payload: keyring() } });
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    await registerMessagingPrivateMacKeyMaterial(transaction, security, MESSAGING_KEY_PURPOSE.operationPayload);
    await registerMessagingPrivateMacKeyMaterial(transaction, security, MESSAGING_KEY_PURPOSE.contactFingerprint);
  });
  const fingerprint = await createAdmissionContactFingerprint({ type: "email", value: contact }, security);
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    for (const userId of [managerId, boundUserId, unboundUserId, freshUserId, pendingUserId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic historical retention account',${`${userId}@example.test`},false,clock_timestamp()-interval '500 days',clock_timestamp()-interval '500 days')`);
    for (const currentTribeId of [tribeId, archivedTribeId]) await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,created_at) values (${currentTribeId},'Synthetic historical retention tribe',${`retention-${currentTribeId}`},${managerId},clock_timestamp()-interval '400 days')`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,created_at) values (${tribeId},${managerId},'leader','active',clock_timestamp()-interval '400 days')`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,changed_by_user_id,created_at,updated_at) values (${tribeId},${managerId},clock_timestamp()-interval '300 days',clock_timestamp()-interval '300 days')`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${boundUserId},'google',${subject},clock_timestamp()-interval '400 days',clock_timestamp()-interval '400 days')`);
    await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${evidenceId},${boundUserId},${accountId},'google',${subject},${contact},true,'example.test','workspace','https://accounts.google.com','synthetic-retention-client',transaction_timestamp()-interval '190 days'-interval '1 minute',transaction_timestamp()-interval '190 days'+interval '1 hour',transaction_timestamp()-interval '190 days'-interval '1 minute')`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${boundUserId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    const snapshot = { version: 1, verificationEpoch: 1, mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, allowCommonExceptions: false };
    for (const resource of [
      { id: oldRequestId, userId: boundUserId, decisionId: oldDecisionId, evidence: "base", decisionAge: 181 },
      { id: unboundRequestId, userId: unboundUserId, decisionId: unboundDecisionId, evidence: "declared", decisionAge: 182 },
      { id: freshRequestId, userId: freshUserId, decisionId: freshDecisionId, evidence: "declared", decisionAge: 179 },
      { id: pendingRequestId, userId: pendingUserId, decisionId: null, evidence: "declared", decisionAge: null },
    ]) {
      const resourceContact = `${resource.userId}@example.test`;
      const resourceFingerprint = await createAdmissionContactFingerprint({ type: "email", value: resourceContact }, security);
      await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,evidence_source,global_identity_evidence_id,original_policy_snapshot,applicant_message,submitted_at,expires_at) values (${resource.id},${tribeId},${resource.userId},'common','email',${resourceContact},${Buffer.from(resourceFingerprint.digest)},${resourceFingerprint.keyId},${resource.evidence},${resource.evidence === "base" ? evidenceId : null},${JSON.stringify(snapshot)}::jsonb,'Synthetic original applicant note',transaction_timestamp()-interval '190 days',transaction_timestamp()-interval '160 days')`);
      if (resource.evidence === "base") {
        await transaction.execute(sql`insert into public.academy_admission_contact_bindings(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source,created_at) values (${bindingId},${tribeId},'email',${contact},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${boundUserId},${oldRequestId},'base',transaction_timestamp()-interval '190 days')`);
        await transaction.execute(sql`update public.academy_admission_requests set binding_id=${bindingId},version=version+1 where id=${oldRequestId}`);
      }
      if (resource.decisionId) {
        await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason,external_message,decided_at) values (${resource.decisionId},${resource.id},${tribeId},${resource.userId},${resource.evidence === "base" ? 2 : 1},'rejected',${managerId},'user','manual_review',1,1,'Synthetic private decision note','Synthetic original applicant response',clock_timestamp()-${resource.decisionAge}::integer*interval '24 hours')`);
        await transaction.execute(sql`update public.academy_admission_requests set status='rejected',version=version+1,decision_id=${resource.decisionId},retry_allowed_at=(select decided_at+interval '24 hours' from public.academy_admission_decisions where id=${resource.decisionId}) where id=${resource.id}`);
        await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type,rule,resource_version,metadata,created_at)
          select request.tribe_id,decision.actor_user_id,'admission_request',request.id,decision.outcome,decision.rule,request.version,
            jsonb_build_object('fromStatus','pending','toStatus',decision.outcome,'previousVersion',decision.request_version,'policyVersion',decision.policy_version,'verificationEpoch',decision.verification_epoch,'proofId',request.proof_id,'decisionId',decision.id,'invitationId',request.invitation_id),decision.decided_at
          from public.academy_admission_requests request join public.academy_admission_decisions decision on decision.id=request.decision_id and decision.request_id=request.id where request.id=${resource.id}`);
        const obligationId = randomUUID();
        await transaction.execute(sql`select public.create_admission_notification_obligation(${obligationId},${tribeId},${resource.id},${resource.userId},'rejected',null,(select decided_at from public.academy_admission_decisions where id=${resource.decisionId}))`);
        await transaction.execute(sql`select public.enqueue_admission_notification(${obligationId},${resource.userId},'applicant')`);
      }
    }
    for (const resource of [
      { id: oldAuditId, tribeId, age: 366 },
      { id: recentAuditId, tribeId, age: 364 },
      { id: archivedAuditId, tribeId: archivedTribeId, age: 367 },
    ]) await transaction.execute(sql`insert into public.academy_admission_audit_events(id,tribe_id,resource_type,resource_id,event_type,rule,created_at) values (${resource.id},${resource.tribeId},'admission_policy',${resource.tribeId},'initialize_admission_policy','initialize_admission_policy',clock_timestamp()-${resource.age}::integer*interval '24 hours')`);
    await transaction.execute(sql`delete from public.tribes where id=${archivedTribeId}`);
  });
  return { managerId, tribeId, archivedTribeId, boundUserId, unboundUserId, freshUserId, pendingUserId, sessionId, bindingId, evidenceId, oldRequestId, unboundRequestId, freshRequestId, pendingRequestId, oldDecisionId, unboundDecisionId, freshDecisionId, oldAuditId, archivedAuditId, recentAuditId, security, contact };
}
