/** Owns original administrative denial vocabulary, effect rollback and metadata pagination. @module personal-invitation-management-constants */
import { ADMISSION_ERROR_CODE } from "./admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Only business failures can complete the original registry; auth and technical failures remain outside. */
export const PERSONAL_INVITATION_DENIAL_CODES = [ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.invitationConflict, ADMISSION_ERROR_CODE.invitationUnavailable, ADMISSION_ERROR_CODE.resourceUnavailable] as const;
/** Distinguishes original metadata from a recorded command refusal without fabricating a resource version. */
export const PERSONAL_INVITATION_MUTATION_DENIED = "denied";
/** Records the narrow cause of a pending cancellation without reusing the link or removing a member. */
export const PERSONAL_INVITATION_AUTHORIZATION_REVOKED = "personal_invitation_authorization_revoked";
/** Represents the immutable default expiry intent independently of wall-clock creation time. */
export const PERSONAL_INVITATION_DEFAULT_EXPIRY = "default";
/** Read-only recovery remains leader-only and projects metadata without initial material. */
export const PERSONAL_INVITATION_RECOVERABLE_OPERATIONS: readonly string[] = [REAUTHENTICATION_OPERATION.createPersonalInvitation, REAUTHENTICATION_OPERATION.renamePersonalInvitation, REAUTHENTICATION_OPERATION.revokePersonalInvitation];
/** Every expected refusal rolls back staged invitation/cancellation/audit before completing the registry. */
export const PERSONAL_INVITATION_EFFECT_SQL = { begin: "savepoint admission_personal_invitation_effect", rollback: "rollback to savepoint admission_personal_invitation_effect", release: "release savepoint admission_personal_invitation_effect" } as const;
/** Preserves native PostgreSQL microseconds in the keyset cursor. */
export const PERSONAL_INVITATION_CURSOR = { separator: "~", timeZone: "UTC", timestampFormat: 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"' } as const;
