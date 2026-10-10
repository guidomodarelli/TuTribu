/** Maps owned PostgreSQL columns inward without provider/schema revalidation or token recovery. @module personal-invitation-row-mapper */
import { parsePhoneNumber } from "libphonenumber-js/max";
import type { PersonalInvitation } from "../../domain/entities/personal-invitation";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";

/** Only selected storage fields are consumed; raw digests never enter a metadata entity. */
export type PersonalInvitationRow = { id: string; tribe_id: string; created_by_user_id: string | null; internal_name: string | null; contact_type: "email" | "phone"; normalized_contact: string; requires_allowlist: boolean; expires_at: string | null; status: PersonalInvitation["status"]; version: number; created_at: string; updated_at: string; redeemed_by_user_id: string | null; redeemed_request_id: string | null; redeemed_at: string | null; revoked_at: string | null; authorization_revoked_at: string | null };
/** @param row - Current authorized own storage projection. @returns An inward entity independent of HTTP/token material. */
export function mapPersonalInvitationRow(row: PersonalInvitationRow): PersonalInvitation {
  return { id: row.id, tribeId: row.tribe_id, createdByUserId: row.created_by_user_id, internalName: row.internal_name,
    contact: row.contact_type === ADMISSION_CONTACT_TYPE.email ? { type: row.contact_type, value: row.normalized_contact } : { type: row.contact_type, value: row.normalized_contact, country: parsePhoneNumber(row.normalized_contact).country ?? "" },
    requiresAllowlist: row.requires_allowlist, expiresAt: row.expires_at ? new Date(row.expires_at) : null, status: row.status, version: row.version,
    createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at), redeemedByUserId: row.redeemed_by_user_id, redeemedRequestId: row.redeemed_request_id,
    redeemedAt: row.redeemed_at ? new Date(row.redeemed_at) : null, revokedAt: row.revoked_at ? new Date(row.revoked_at) : null, authorizationRevokedAt: row.authorization_revoked_at ? new Date(row.authorization_revoked_at) : null };
}
