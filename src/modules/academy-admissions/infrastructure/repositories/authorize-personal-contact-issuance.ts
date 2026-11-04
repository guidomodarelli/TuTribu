/** Checks current personal authorization before creating another local code obligation, without consuming the invitation. @module authorize-personal-contact-issuance */
import "server-only";
import { assertUnreservedAdmissionContact } from "./assert-unreserved-admission-contact";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionVerificationAccountScope } from "../../domain/repositories/admission-contact-verification";
import { admissionContactStoredValues, isSameAdmissionContact, type AdmissionContact } from "../../domain/value-objects/admission-contact";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_INVITATION_STATUS } from "../../constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { ALLOWLIST_ENTRY_STATUS } from "../../constants/admission-resources";
import { admissionDatabaseNow } from "./postgres-admission-leader-authorizer";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** @param database - Original native transaction holding tribe/account scope. @param context - Actual account/tribe with optional exact own pending. @param issuance - The verified token resource or immutable stored challenge origin (`invitationId`), the server-normalized confirmed destination (`contact`) and a fresh private recovery/key snapshot for an unconsumed link (`security`). @returns Nothing while active or the exact redeemed pending retains authorization; no link/request/binding is changed. */
export async function authorizePersonalContactIssuance(database: RequestDatabase, context: AdmissionVerificationAccountScope & { admissionRequestId?: string | null }, { invitationId, contact, security }: { invitationId: string; contact: AdmissionContact; security: MessagingSecurityConfig }): Promise<void> {
  const invitation = (await database.execute<{ status: string; contact_type: string; normalized_contact: string; requires_allowlist: boolean; expires_at: string | null; authorization_revoked_at: string | null; redeemed_by_user_id: string | null; redeemed_request_id: string | null; token_key_id: string }>(sql`select status,contact_type,normalized_contact,requires_allowlist,expires_at,authorization_revoked_at,redeemed_by_user_id,redeemed_request_id,token_key_id from public.academy_personal_invitations where id=${invitationId} and tribe_id=${context.tribeId} for share`)).rows[0];
  // An invitation saved before an Argentine mobile took its 9 still names the same phone.
  const stored = admissionContactStoredValues(contact);
  if (!invitation || !isSameAdmissionContact({ type: invitation.contact_type, value: invitation.normalized_contact }, contact) || invitation.authorization_revoked_at !== null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  const now = await admissionDatabaseNow(database);
  if (context.admissionRequestId) {
    const request = (await database.execute<{ status: string; source: string; invitation_id: string | null; expires_at: string }>(sql`select status,source,invitation_id,expires_at from public.academy_admission_requests where id=${context.admissionRequestId} and user_id=${context.userId} and tribe_id=${context.tribeId} for share`)).rows[0];
    if (invitation.status !== ADMISSION_INVITATION_STATUS.redeemed || invitation.redeemed_by_user_id !== context.userId || invitation.redeemed_request_id !== context.admissionRequestId || request?.invitation_id !== invitationId || request.status !== ADMISSION_REQUEST_STATUS.pending || now >= new Date(request.expires_at)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  } else if (invitation.status !== ADMISSION_INVITATION_STATUS.active || invitation.expires_at && now >= new Date(invitation.expires_at) || security.recoveryLocked || !security.keyrings[MESSAGING_KEY_PURPOSE.invitationToken].keys.has(invitation.token_key_id)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
  const binding = (await database.execute<{ owner_user_id: string }>(sql`select owner_user_id from public.academy_admission_contact_bindings where tribe_id=${context.tribeId} and contact_type=${contact.type} and normalized_contact=any(${sql.param(stored)}::text[]) order by normalized_contact=${contact.value} desc limit 1`)).rows[0];
  await assertUnreservedAdmissionContact(database, context.tribeId, contact, async () => security);
  if (binding && binding.owner_user_id !== context.userId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactBindingConflict);
  if (invitation.requires_allowlist && !(await database.execute(sql`select id from public.academy_allowlist_entries where tribe_id=${context.tribeId} and contact_type=${contact.type} and normalized_contact=any(${sql.param(stored)}::text[]) and status=${ALLOWLIST_ENTRY_STATUS.enabled} limit 1 for share`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
}
