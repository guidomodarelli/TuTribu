import { notFound } from "next/navigation";

import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

import type { resolveVisibleTribePageAccess } from "./tribe-page-access";

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
 * Hides (404) a management page from anyone but an active leader or
 * guardian of the tribe.
 *
 * @param modules - Request modules of the page.
 * @param tribeSlug - Slug of the visible tribe.
 */
export async function requireTribeManagerMembership(
  modules: TribePageModules,
  tribeSlug: string
): Promise<void> {
  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribeSlug);

  if (
    currentMembership?.role !== TRIBE_MANAGER_ROLE.leader &&
    currentMembership?.role !== TRIBE_MANAGER_ROLE.guardian
  ) {
    notFound();
  }

  await requireActiveTribeMembership(modules, tribeSlug);
}
