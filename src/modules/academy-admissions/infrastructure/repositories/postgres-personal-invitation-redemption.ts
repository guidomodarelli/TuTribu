/** Resolves opaque personal material and stages a single-use redemption inside the original admission transaction. @module postgres-personal-invitation-redemption */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionRequest } from "../../domain/entities/admission-request";
import { redeemPersonalInvitation, type PersonalInvitation } from "../../domain/entities/personal-invitation";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_INVITATION_STATUS } from "../../constants/admission-eligibility";
import { ADMISSION_REQUEST_SOURCE } from "../../constants/admission-request";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { PERSONAL_INVITATION_REDEEMED_EVENT } from "../../constants/personal-invitation-management";
import { createPersonalInvitationTokenCodec, type PersonalInvitationTokenReference } from "../tokens/personal-invitation-token";
import { mapPersonalInvitationRow, type PersonalInvitationRow } from "./personal-invitation-row-mapper";
import { admissionDatabaseNow } from "./postgres-admission-leader-authorizer";

/** Private locked lookup provenance never becomes a recipient/leader public DTO. */
export type ResolvedPersonalInvitation = { invitation: PersonalInvitation; reference: PersonalInvitationTokenReference; environment: string; securityEpoch: string };

/** @param original - Original verified immutable token context. @param token - Original proposed material. @param security - Fresh hosting keys sampled after preceding waits. @returns Nothing while environment/epoch and retained token key remain usable; no resource effect occurs. */
export async function assertPersonalInvitationTokenCurrent(original: ResolvedPersonalInvitation, token: string, security: MessagingSecurityConfig): Promise<void> {
  if (security.environment !== original.environment || security.securityEpoch !== original.securityEpoch || !await createPersonalInvitationTokenCodec(security).verify(token, original.reference)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
}

/** @param database - Original guarded submission transaction already holding the tribe lock. @param scope - Actual applicant and fixed tenant. @param token - Opaque proposed material, never a permission flag. @param security - Current private hosting keys. @returns A locked inward resource only after exact contextual verification, without consuming it or disclosing the recipient. */
export async function resolvePersonalInvitationForRedemption(database: RequestDatabase, scope: AdmissionCommandScope, token: string, security: MessagingSecurityConfig): Promise<ResolvedPersonalInvitation> {
  const codec = createPersonalInvitationTokenCodec(security), lookups = await codec.lookup(token);
  if (!lookups.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  const matches = lookups.map((lookup) => sql`(token_key_id=${lookup.keyId} and token_hash=${Buffer.from(lookup.lookupDigest)})`);
  const row = (await database.execute<PersonalInvitationRow & { token_key_id: string; token_hash: Uint8Array; token_context_digest: Uint8Array | null }>(sql`select * from public.academy_personal_invitations where tribe_id=${scope.tribeId} and (${sql.join(matches, sql` or `)}) for update`)).rows[0];
  if (!row?.token_context_digest) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  const reference: PersonalInvitationTokenReference = { tribeId: row.tribe_id, invitationId: row.id, keyId: row.token_key_id, lookupDigest: row.token_hash, digest: row.token_context_digest };
  if (!await codec.verify(token, reference)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  return { invitation: mapPersonalInvitationRow(row), reference, environment: security.environment, securityEpoch: security.securityEpoch };
}

/** @param database - Same original transaction holding the resource and related request. @param scope - Actual applicant and native tenant. @param original - Locked verified resource with immutable scope. @param request - Exact new presentation whose other evidence/binding effects are already staged. @param ledgerId - Original operation registry identity. @param token - Original proposed material for the final key-retirement check. @param security - Fresh private hosting security sampled after preceding waits. @returns After one CAS increment and audit are staged; the caller commits request/decision/member/notice together. */
export async function commitPersonalInvitationRedemption(database: RequestDatabase, scope: AdmissionCommandScope, original: ResolvedPersonalInvitation, request: AdmissionRequest, ledgerId: string, token: string, security: MessagingSecurityConfig): Promise<void> {
  const invitation = original.invitation;
  if (request.source !== ADMISSION_REQUEST_SOURCE.personal || request.invitationId !== invitation.id || request.tribeId !== scope.tribeId || request.userId !== scope.userId || invitation.tribeId !== scope.tribeId || request.requiresAllowlist !== invitation.requiresAllowlist) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  await assertPersonalInvitationTokenCurrent(original, token, security);
  const now = await admissionDatabaseNow(database);
  const proposal = redeemPersonalInvitation({ invitation, expectedVersion: invitation.version, userId: scope.userId, requestId: request.id, now }).invitation;
  const updated = (await database.execute(sql`update public.academy_personal_invitations set status=${ADMISSION_INVITATION_STATUS.redeemed},redeemed_by_user_id=${scope.userId},redeemed_request_id=${request.id},redeemed_at=${now},updated_at=${now},version=${proposal.version} where id=${invitation.id} and tribe_id=${scope.tribeId} and status=${ADMISSION_INVITATION_STATUS.active} and version=${invitation.version} and authorization_revoked_at is null and (expires_at is null or expires_at>clock_timestamp()) returning id`)).rows[0];
  if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,resource_version) values (${scope.tribeId},${scope.userId},${ADMISSION_RESOURCE_KIND.personalInvitation},${invitation.id},${ledgerId},${PERSONAL_INVITATION_REDEEMED_EVENT},${proposal.version})`);
}
