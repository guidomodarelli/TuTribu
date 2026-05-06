import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";

import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
  type TribePageAccessResult,
} from "../results/tribe-page-access-result";

type GetTribePageAccessDependencies = {
  tribeReadRepository: TribeReadRepository;
};

export function getTribePageAccess({
  tribeReadRepository,
}: GetTribePageAccessDependencies) {
  return async ({
    isAuthenticated,
    slug,
  }: {
    isAuthenticated: boolean;
    slug: string;
  }): Promise<TribePageAccessResult> => {
    const normalizedSlug = slug.trim().toLowerCase();

    if (normalizedSlug.length === 0) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.hidden,
        reason: TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible,
      };
    }

    if (!isAuthenticated) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.hidden,
        reason: TRIBE_PAGE_ACCESS_REASON.unauthenticatedHidden,
      };
    }

    const tribe = await tribeReadRepository.findBySlug(normalizedSlug);

    if (tribe) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.visible,
        tribe,
      };
    }

    const membershipStatus =
      await tribeReadRepository.findCurrentMembershipStatusBySlug(
        normalizedSlug
      );

    if (membershipStatus === TRIBE_MEMBERSHIP_STATUS.blocked) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.hidden,
        reason: TRIBE_PAGE_ACCESS_REASON.blockedHidden,
      };
    }

    return {
      status: TRIBE_PAGE_ACCESS_STATUS.hidden,
      reason: TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible,
    };
  };
}
