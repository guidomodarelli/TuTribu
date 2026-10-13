/** Reads current list availability for private issuance without contact indexes or recovered tokens. @module personal-invitation-availability-reader */
import type { AdmissionContactType } from "../value-objects/admission-contact";
import type { AuthorizedAdmissionContext } from "./admission-authorization-reader";

/** Availability is informational; the command writer repeats actual policy/list facts under its locks. */
export interface PersonalInvitationAvailabilityReader {
  /** @param context - Native current leader scope. @param contactType - Policy-selected contact type. @returns Whether this tribe has an enabled entry of that exact type, without exposing another contact. */
  hasUsableAllowlist(context: AuthorizedAdmissionContext, contactType: AdmissionContactType): Promise<boolean>;
}
