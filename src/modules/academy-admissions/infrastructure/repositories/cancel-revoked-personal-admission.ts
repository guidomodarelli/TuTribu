/** Closes only the exact redeemed pending request within the original leader revocation commit. @module cancel-revoked-personal-admission */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AdmissionNotificationObligationWriter } from "../../domain/repositories/admission-repositories";
import type { PersonalInvitation } from "../../domain/entities/personal-invitation";
import { ADMISSION_REQUEST_STATUS, ADMISSION_REQUEST_SOURCE, ADMISSION_REQUEST_EVENT } from "../../constants/admission-request";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { ADMISSION_DECISION_ACTOR_KIND, ADMISSION_DECISION_RULE } from "../../constants/admission-decision";
import { PERSONAL_INVITATION_AUTHORIZATION_REVOKED } from "../../constants/personal-invitation-management";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";

/** @param database - Original transaction holding tribe/invitation locks. @param input - Exact redeemed lineage, native leader, original ledger and private reason. @param notifications - Scoped existing DB-only obligation port. @returns True only when the original pending was cancelled; an approved/other terminal request remains untouched. */
export async function cancelRevokedPersonalAdmission(database: RequestDatabase, input: { context: AuthorizedAdmissionContext; invitation: PersonalInvitation; ledgerId: string; internalReason: string; now: Date }, notifications: AdmissionNotificationObligationWriter): Promise<boolean> {
  const invitation = input.invitation;
  const request = (await database.execute<{ id: string; user_id: string; source: string; invitation_id: string | null; version: number; status: string; original_policy_snapshot: { version: number; verificationEpoch: number } }>(sql`select id,user_id,source,invitation_id,version,status,original_policy_snapshot from public.academy_admission_requests where id=${invitation.redeemedRequestId} and tribe_id=${invitation.tribeId} and user_id=${invitation.redeemedByUserId} for update`)).rows[0];
  if (!request || request.source !== ADMISSION_REQUEST_SOURCE.personal || request.invitation_id !== invitation.id) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  if (request.status !== ADMISSION_REQUEST_STATUS.pending) return false;
  const decisionId = randomUUID();
  await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason,decided_at) values (${decisionId},${request.id},${invitation.tribeId},${request.user_id},${request.version},${ADMISSION_REQUEST_STATUS.cancelled},${input.context.userId},${ADMISSION_DECISION_ACTOR_KIND.user},${ADMISSION_DECISION_RULE.managementCancellation},${request.original_policy_snapshot.version},${request.original_policy_snapshot.verificationEpoch},${input.internalReason},${input.now})`);
  const closed = (await database.execute(sql`update public.academy_admission_requests set status=${ADMISSION_REQUEST_STATUS.cancelled},decision_id=${decisionId},cancel_reason=${PERSONAL_INVITATION_AUTHORIZATION_REVOKED},version=version+1 where id=${request.id} and tribe_id=${invitation.tribeId} and user_id=${request.user_id} and status=${ADMISSION_REQUEST_STATUS.pending} and version=${request.version} returning id`)).rows[0];
  if (!closed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
  await notifications.record({ id: randomUUID(), tribeId: invitation.tribeId, admissionRequestId: request.id, applicantUserId: request.user_id, event: ADMISSION_REQUEST_EVENT.cancelled });
  await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,resource_version) values (${invitation.tribeId},${input.context.userId},${ADMISSION_RESOURCE_KIND.request},${request.id},${input.ledgerId},${ADMISSION_REQUEST_EVENT.cancelled},${PERSONAL_INVITATION_AUTHORIZATION_REVOKED},${request.version + 1})`);
  return true;
}
