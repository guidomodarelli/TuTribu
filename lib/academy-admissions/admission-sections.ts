/** Decides which admission sections a member sees, shared by the app rail group and the in-page section row. @module admission-sections */
import { ADMISSION_PAGES, ADMISSION_SECTION_AUDIENCE, ADMISSION_SECTIONS, type AdmissionPage, type AdmissionSectionAudience } from "@/src/modules/academy-admissions/constants/admission-sections";
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

/** Separator between route segments, and the trailing separators a pathname may carry. */
const ROUTE_SEPARATOR = "/";

/** @param route - Route relative to the tribe. @returns The route without its trailing separators. */
function withoutTrailingSeparators(route: string): string {
  let end = route.length;
  while (end > 0 && route[end - 1] === ROUTE_SEPARATOR) end -= 1;
  return route.slice(0, end);
}

/**
 * Finds the admission page a pathname belongs to: the longest page route that is the pathname or one of its parents, so
 * the request history and the CSV import win over their sections.
 * @param pathname - Current pathname.
 * @param slug - Slug of the tribe in the route.
 * @returns The page key, or undefined outside the admission pages.
 */
export function resolveAdmissionPage(pathname: string, slug: string): AdmissionPage | undefined {
  const tribePath = `${ROUTE_SEPARATOR}${encodeURIComponent(slug)}${ROUTE_SEPARATOR}`;
  if (!pathname.startsWith(tribePath)) return undefined;
  const route = withoutTrailingSeparators(pathname.slice(tribePath.length));
  let match: { page: AdmissionPage; length: number } | undefined;
  for (const [page, definition] of Object.entries(ADMISSION_PAGES) as [AdmissionPage, (typeof ADMISSION_PAGES)[AdmissionPage]][]) {
    const owns = route === definition.segment || route.startsWith(`${definition.segment}${ROUTE_SEPARATOR}`);
    if (owns && (!match || definition.segment.length > match.length)) match = { page, length: definition.segment.length };
  }
  return match?.page;
}
