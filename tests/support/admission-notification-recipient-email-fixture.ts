/** Preserves coherent synthetic email/phone proof history before installing its original guard. @module admission-notification-recipient-email-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareHistoricalAdmissionEvidence } from "./admission-evidence-historical-fixture";
import { applyAdmissionMigrationJournal } from "./admission-migration-command";
import { createAdmissionRequestSnapshotFixture } from "./admission-request-snapshot-fixture";
import type { AdmissionNotificationRecipientEmailScope } from "@/src/modules/notifications/domain/entities/admission-notification-recipient-email";

/**
 * Creates original notice/account/proof relationships without bypassing an installed evidence guard.
 * @param database - Verified disposable PostgreSQL branch owned by this run.
 * @returns Existing scoped notices and current runtime metadata, without any provider call or secret key.
 */
export async function prepareAdmissionNotificationRecipientEmails(database: AcademyAdmissionTestDatabase) {
  const tribeId = randomUUID(), otherTribeId = randomUUID(), leaderId = randomUUID(), guardianId = randomUUID(), otherLeaderId = randomUUID();
  const applicantIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()], requestIds = applicantIds.map(() => randomUUID()), obligationIds = applicantIds.map(() => randomUUID());
  const reviewApplicantId = randomUUID(), reviewRequestId = randomUUID(), reviewObligationId = randomUUID();
  const users = [leaderId, guardianId, otherLeaderId, ...applicantIds, reviewApplicantId];
  const accountIds = new Map(users.map((userId) => [userId, randomUUID()])), subjects = new Map(users.map((userId) => [userId, randomUUID()]));
  const emails = applicantIds.map((userId, index) => `${userId}.alias+tag@${index === 0 || index === 3 ? "gmail.com" : "example.invalid"}`);
  const runtime = { environment: randomUUID(), securityEpoch: randomUUID() };
  const localConnectionId = randomUUID();
  const proofIds = applicantIds.map(() => randomUUID());
  const own = { userId: leaderId, email: null }, system = { userId: null, email: null };
  const capturedUsers = new Set([leaderId, guardianId, otherLeaderId, applicantIds[0], applicantIds[3]]);
  await prepareHistoricalAdmissionEvidence(database, () => database.withContext(own, async (transaction) => {
    const createdAt = (await transaction.execute<{ instant: string }>(sql`select (clock_timestamp()-interval '72 hours')::text as instant`)).rows[0].instant;
    for (const userId of users) {
      const index = applicantIds.indexOf(userId), email = index >= 0 ? emails[index] : `${userId}@gmail.com`;
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic recipient email account',${email},${index === 1 || index === 2},${createdAt},${createdAt})`);
      await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountIds.get(userId)!},${userId},'google',${subjects.get(userId)!},${createdAt},${createdAt})`);
      if (capturedUsers.has(userId)) await transaction.execute(sql`insert into public.global_identity_evidence(user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${userId},${accountIds.get(userId)!},'google',${subjects.get(userId)!},${email},true,'gmail','https://accounts.google.com','synthetic-recipient-client',${createdAt},${createdAt}::timestamptz+interval '1 hour',${createdAt})`);
    }
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,created_at) values (${tribeId},'Synthetic recipient email tribe',${`recipient-${tribeId}`},${leaderId},${createdAt}),(${otherTribeId},'Other recipient email tribe',${`recipient-${otherTribeId}`},${otherLeaderId},${createdAt})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active'),(${tribeId},${guardianId},'guardian','active'),(${otherTribeId},${otherLeaderId},'leader','active')`);
    for (const index of [0, 1, 2, 3]) {
      const sourceTribeId = index === 3 ? otherTribeId : tribeId, actorId = index === 3 ? otherLeaderId : leaderId;
      const local = index === 1 || index === 2, phone = index === 2, contact = phone ? "+5491155501234" : emails[index], contactType = phone ? "phone" : "email";
      const decisionId = randomUUID(), bindingId = randomUUID(), fingerprint = randomBytes(32);
      if (local) {
        const challengeId = randomUUID(), deliveryId = randomUUID(), connectionId = localConnectionId;
        if (index === 1) {
          await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version,created_at) values (${connectionId},${sourceTribeId},${actorId},'degraded',${runtime.environment},${runtime.securityEpoch},true,1,${createdAt})`);
          await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,created_at) values (${connectionId},${sourceTribeId},1,${runtime.environment},${runtime.securityEpoch},${createdAt})`);
        }
        await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,recipient_country,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,state,queued_usage_policy_version,created_at,deadline_at) values (${deliveryId},${sourceTribeId},${connectionId},1,${runtime.environment},${runtime.securityEpoch},'admission',${challengeId},${applicantIds[index]},${contact},${phone ? "AR" : null},${phone ? "sms" : "email"},${randomUUID()},${randomBytes(32)},'synthetic-historical-payload','{}'::jsonb,'delivered',1,${createdAt},${createdAt}::timestamptz+interval '10 minutes')`);
        await transaction.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,verification_epoch,connection_id,connection_version,security_epoch,channel,state,created_at,expires_at,verified_at,mac_key_id,delivery_id) values (${challengeId},${applicantIds[index]},${sourceTribeId},${phone ? "phone" : "email"},${contact},${fingerprint},'synthetic-historical-fingerprint','admission',1,${connectionId},1,${runtime.securityEpoch},${phone ? "sms" : "email"},'verified',${createdAt},${createdAt}::timestamptz+interval '10 minutes',${createdAt}::timestamptz+interval '1 minute','synthetic-historical-verification',${deliveryId})`);
        await transaction.execute(sql`insert into public.academy_admission_verification_proofs(id,challenge_id,user_id,tribe_id,contact_type,normalized_contact,verification_epoch,connection_id,connection_version,security_epoch,verified_at,apply_before,status,applied_request_id,applied_at) values (${proofIds[index]},${challengeId},${applicantIds[index]},${sourceTribeId},${phone ? "phone" : "email"},${contact},1,${connectionId},1,${runtime.securityEpoch},${createdAt}::timestamptz+interval '1 minute',${createdAt}::timestamptz+interval '16 minutes','applied',${requestIds[index]},${createdAt}::timestamptz+interval '2 minutes')`);
        await transaction.execute(sql`insert into public.academy_admission_contact_bindings(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,first_proof_id,evidence_source,created_at) values (${bindingId},${sourceTribeId},${phone ? "phone" : "email"},${contact},${fingerprint},'synthetic-historical-fingerprint',${applicantIds[index]},${requestIds[index]},${proofIds[index]},'local',${createdAt}::timestamptz+interval '2 minutes')`);
      }
      await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,status,decision_id,contact_type,normalized_contact,evidence_source,proof_id,binding_id,submitted_at,expires_at) values (${requestIds[index]},${sourceTribeId},${applicantIds[index]},'common','rejected',${decisionId},${local ? contactType : null},${local ? contact : null},${local ? "local" : "none"},${local ? proofIds[index] : null},${local ? bindingId : null},${createdAt}::timestamptz+interval '2 minutes',${createdAt}::timestamptz+interval '30 days')`);
      await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch) values (${decisionId},${requestIds[index]},${sourceTribeId},${applicantIds[index]},1,'rejected',${actorId},'user','synthetic_historical_rejection',1,1)`);
      await transaction.execute(sql`insert into public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type) values (${obligationIds[index]},${sourceTribeId},${requestIds[index]},${applicantIds[index]},'rejected')`);
      await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type,rule,resource_version) values (${sourceTribeId},${actorId},'admission_request',${requestIds[index]},'rejected','synthetic_historical_rejection',1)`);
      await transaction.execute(sql`select public.enqueue_admission_notification(${obligationIds[index]},${applicantIds[index]},'applicant')`);
    }
    const reviewSnapshot = createAdmissionRequestSnapshotFixture({ id: reviewRequestId, tribeId, userId: reviewApplicantId, submittedAt: new Date() });
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,original_policy_snapshot,submitted_at,expires_at) values (${reviewRequestId},${tribeId},${reviewApplicantId},'common',${JSON.stringify(reviewSnapshot)}::jsonb,clock_timestamp(),clock_timestamp()+interval '29 days')`);
    await transaction.execute(sql`insert into public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type) values (${reviewObligationId},${tribeId},${reviewRequestId},${reviewApplicantId},'pending_created')`);
    await transaction.execute(sql`select public.enqueue_admission_notification(${reviewObligationId},${guardianId},'reviewer')`);
  }));
  await applyAdmissionMigrationJournal(database);
  const scopes: AdmissionNotificationRecipientEmailScope[] = obligationIds.map((obligationId, index) => ({ tribeId: index === 3 ? otherTribeId : tribeId, obligationId, recipientUserId: applicantIds[index], audience: "applicant" }));
  const reviewScope: AdmissionNotificationRecipientEmailScope = { tribeId, obligationId: reviewObligationId, recipientUserId: guardianId, audience: "reviewer" };
  return { tribeId, otherTribeId, leaderId, guardianId, applicantIds, requestIds, obligationIds, accountIds, emails, scopes, reviewScope, runtime, proofIds, own, system };
}
