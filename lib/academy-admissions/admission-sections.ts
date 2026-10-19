/** Decides which admission sections a member sees, shared by the app rail group and the in-page section row. @module admission-sections */
import { ADMISSION_SECTION_AUDIENCE, ADMISSION_SECTIONS, type AdmissionSectionAudience } from "@/src/modules/academy-admissions/constants/admission-sections";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";

/** Tribe role that opens every admission section. */
const LEADER_ROLE = "leader" satisfies MemberTribeListItemResult["role"];

/**
 * @param role - The member's role in the tribe.
 * @returns The leader audience for the leader and the reviewer audience otherwise; the server authorizes each page again.
 */
export function admissionAudienceForRole(role: MemberTribeListItemResult["role"]): AdmissionSectionAudience {
  return role === LEADER_ROLE ? ADMISSION_SECTION_AUDIENCE.leader : ADMISSION_SECTION_AUDIENCE.reviewer;
}

/**
 * @param audience - Who is viewing.
 * @returns The admission sections that audience may open, in navigation order.
 */
export function visibleAdmissionSections(audience: AdmissionSectionAudience) {
  return ADMISSION_SECTIONS.filter((item) => audience === ADMISSION_SECTION_AUDIENCE.leader || item.audience === ADMISSION_SECTION_AUDIENCE.reviewer);
}
