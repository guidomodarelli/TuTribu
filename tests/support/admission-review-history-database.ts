/** Seeds only an owned branch for request-scoped reviewer history and future native UI checks. @module admission-review-history-database */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase } from "./contact-verification-database-fixture";
import { ADMISSION_REVIEW_HISTORY_VALIDATION as VALIDATION } from "./constants/admission-review-history-validation";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { ADMISSION_REQUEST_EVENT } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_PROOF_AUDIT_EVENT } from "@/src/modules/academy-admissions/constants/admission-proof";

/** Synthetic sessions stay in memory; no credential is hardcoded or exported to documentation. */
export type AdmissionReviewHistoryTestIdentity = { userId: string; sessionId: string; sessionToken: string; email: string };

/**
 * Prepares minimal current reviewer scope and stored audit fixtures, without invoking a sender or disabling a guard.
 * @param database - This run's confirmed disposable branch.
 * @param securityConfig - Optional generated hosting configuration shared with the real local server.
 * @param onPhase - Optional bounded fixture progress without data or driver errors.
 * @returns Native identities, exact request/event references and synthetic private markers.
 */
export async function prepareAdmissionReviewHistoryDatabase(database: AcademyAdmissionTestDatabase, securityConfig?: MessagingSecurityConfig, onPhase?: (phase: string) => void) {
  onPhase?.(VALIDATION.stages.migrate);
  const fixture = await prepareContactVerificationDatabase(database, securityConfig);
  /** @param userId - Optional existing synthetic account. @returns Independent native session and contact aliases. */
  const identity = (userId: string = randomUUID()): AdmissionReviewHistoryTestIdentity => ({ userId, sessionId: randomUUID(), sessionToken: randomUUID(), email: `cuenta-${randomUUID().slice(0, 8)}@example.test` });
  const leader = identity(fixture.userId), guardian = identity(), applicant = identity(), otherApplicant = identity();
  const tribeId = randomUUID(), foreignTribeId = randomUUID();
  const admissionRequestId = randomUUID(), otherRequestId = randomUUID(), foreignRequestId = randomUUID();
  const eventIds = VALIDATION.eventOffsetsMicroseconds.map(() => randomUUID());
  await database.withContext(fixture.own, async (transaction) => {
    onPhase?.(VALIDATION.stages.sessions);
    const activatedAt = (await transaction.execute<{ instant: string }>(sql`select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as instant`)).rows[0].instant;
    for (const [index, account] of [leader, guardian, applicant, otherApplicant].entries()) {
      if (account !== leader) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${account.userId},${index === 1 ? "Guardián de ejemplo" : "Solicitante de ejemplo"},${account.email},false,clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${account.sessionId},${account.userId},${account.sessionToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    }
    onPhase?.(VALIDATION.stages.activation);
    for (const currentTribeId of [tribeId, foreignTribeId]) {
      await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${currentTribeId},'Academia de ejemplo',${`review-history-${currentTribeId}`},${leader.userId})`);
      await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${currentTribeId},'academy',true)`);
      await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,requires_whatsapp_number,is_open,activated_at) values (${currentTribeId},false,true,${activatedAt})`);
    }
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leader.userId},'leader','active'),(${tribeId},${guardian.userId},'guardian','active')`);
    for (const currentTribeId of [tribeId, foreignTribeId]) await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${activatedAt} where id=${currentTribeId}`);
    onPhase?.(VALIDATION.stages.requests);
    for (const [id, targetTribeId, account] of [[admissionRequestId, tribeId, applicant], [otherRequestId, tribeId, otherApplicant], [foreignRequestId, foreignTribeId, applicant]] as const) {
      await transaction.execute(sql`with instant as (select clock_timestamp()-interval '3 minutes' as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,submitted_at,expires_at) select ${id},${targetTribeId},${account.userId},'common','email',${account.email},'declared',${JSON.stringify(VALIDATION.originalPolicy)}::jsonb,'Quiero participar.',now,now+interval '30 days' from instant`);
    }
    onPhase?.(VALIDATION.stages.history);
    const instant = (await transaction.execute<{ instant: string }>(sql`select to_char((date_trunc('second',clock_timestamp())+${VALIDATION.fractionalMicroseconds}*interval '1 microsecond') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as instant`)).rows[0].instant;
    for (const [index, eventId] of eventIds.entries()) {
      const offset = VALIDATION.eventOffsetsMicroseconds[index];
      const eventType = index === 0 ? ADMISSION_REQUEST_EVENT.pendingCreated : index === eventIds.length - 1 ? VALIDATION.unknownEvent : ADMISSION_PROOF_AUDIT_EVENT;
      await transaction.execute(sql`insert into public.academy_admission_audit_events(id,tribe_id,actor_user_id,resource_type,resource_id,event_type,rule,cause,resource_version,metadata,created_at) values (${eventId},${tribeId},${index === 0 ? applicant.userId : null},'admission_request',${admissionRequestId},${eventType},'manual_review',${VALIDATION.unknownCause},${index === 0 ? 1 : null},jsonb_build_object('fromStatus',null,'toStatus','pending','internalReason',${VALIDATION.privateNote}::text,'rawContact',${applicant.email}::text),${instant}::timestamptz+${offset}*interval '1 microsecond')`);
    }
    for (const [targetTribeId, targetRequestId] of [[tribeId, otherRequestId], [foreignTribeId, foreignRequestId]]) await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type,metadata) values (${targetTribeId},${applicant.userId},'admission_request',${targetRequestId},'pending_created','{}'::jsonb)`);
    await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type,metadata) values (${tribeId},${leader.userId},'admission_policy',${tribeId},'update_admission_policy',jsonb_build_object('internalReason',${VALIDATION.privateNote}::text))`);
  });
  onPhase?.(VALIDATION.stages.grants);
  await database.grantTablesToNonBypass(["tribes", "tribe_members", "session", "user", "academy_admission_requests", "academy_admission_audit_events"]);
  const readRolePrivileges = await database.withContext(fixture.own, async (transaction) => {
    /** @returns Actual catalog SELECT privileges needed by the real authenticated-account projection. */
    const inspect = async () => (await transaction.execute<{ account: boolean; session_binding: boolean; identity_evidence: boolean }>(sql`select has_table_privilege(${database.nonBypassRole.name},'public.account','SELECT') as account,has_table_privilege(${database.nonBypassRole.name},'public.global_session_identity_bindings','SELECT') as session_binding,has_table_privilege(${database.nonBypassRole.name},'public.global_identity_evidence','SELECT') as identity_evidence`)).rows[0];
    const before = await inspect();
    await transaction.execute(sql`grant select on table public.account,public.global_session_identity_bindings,public.global_identity_evidence to ${sql.identifier(database.nonBypassRole.name)}`);
    return { before, after: await inspect() };
  });
  return { ...fixture, leader, guardian, applicant, otherApplicant, tribeId, foreignTribeId, admissionRequestId, otherRequestId, foreignRequestId, eventIds, readRolePrivileges, slug: `review-history-${tribeId}` };
}
