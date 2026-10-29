import { notFound } from "next/navigation";

import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

import { resolveVisibleTribePageAccess } from "./tribe-page-access";

type TribePageModules = Awaited<ReturnType<typeof resolveVisibleTribePageAccess>>["modules"];

/** Roles allowed to manage a tribe (channels, invitations). */
const TRIBE_MANAGER_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

/**
 * Hides (404) a tribe page from a viewer whose membership is not active.
 *
 * @param modules - Request modules of the page.
 * @param tribeSlug - Slug of the visible tribe.
 */
export async function requireActiveTribeMembership(
  modules: TribePageModules,
  tribeSlug: string
): Promise<void> {
  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(tribeSlug);

  if (membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active) {
    notFound();
  }
}

/**
 * Finds the viewer's membership in a tribe among the viewer's tribes.
 *
 * @param modules - Request modules of the page.
 * @param tribeSlug - Slug of the visible tribe.
 * @returns The viewer's tribe list item, or `undefined` when the viewer is not listed in it.
 */
export async function findCurrentTribeMembership(
  modules: TribePageModules,
  tribeSlug: string
) {
  return (await modules.tribes.useCases.getMemberTribes()).find(
    (tribeListItem) => tribeListItem.slug === tribeSlug
  );
}

/**
 * Hides (404) a management page from anyone but an active leader or
 * guardian of the tribe.
 *
 * @param modules - Request modules of the page.
 * @param tribeSlug - Slug of the visible tribe.
 */
async function requireTribeManagerMembership(
  modules: TribePageModules,
  tribeSlug: string
): Promise<void> {
  const currentMembership = await findCurrentTribeMembership(modules, tribeSlug);

  if (
    currentMembership?.role !== TRIBE_MANAGER_ROLE.leader &&
    currentMembership?.role !== TRIBE_MANAGER_ROLE.guardian
  ) {
    notFound();
  }

  await requireActiveTribeMembership(modules, tribeSlug);
}

/**
 * Resolves the access of a tribe management page (channels, invitations):
 * the visible tribe page access, then a 404 for anyone but an active leader
 * or guardian.
 *
 * @param options - Log operation, tribe slug, and the page's callback path.
 * @returns The authenticated member, the visible tribe, and request modules.
 */
export async function resolveTribeManagerPageAccess(
  options: Parameters<typeof resolveVisibleTribePageAccess>[0]
) {
  const access = await resolveVisibleTribePageAccess(options);

  await requireTribeManagerMembership(access.modules, access.tribe.slug);

  return access;
}
