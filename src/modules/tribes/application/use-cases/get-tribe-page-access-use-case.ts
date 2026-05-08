import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";

import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_MEMBERSHIP_STATUS_REASON,
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

    const membershipAccess = tribeReadRepository.findCurrentMembershipAccessBySlug
      ? await tribeReadRepository.findCurrentMembershipAccessBySlug(normalizedSlug)
      : await tribeReadRepository
          .findCurrentMembershipStatusBySlug(normalizedSlug)
          .then((status) =>
            status
              ? {
                  status,
                  statusReason: TRIBE_MEMBERSHIP_STATUS_REASON.none,
                }
              : null
          );
    const membershipStatus = membershipAccess?.status ?? null;

    if (membershipStatus === TRIBE_MEMBERSHIP_STATUS.blocked) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.hidden,
        blockedReason:
          membershipAccess?.statusReason ?? TRIBE_MEMBERSHIP_STATUS_REASON.none,
        reason: TRIBE_PAGE_ACCESS_REASON.blockedHidden,
      };
    }

    if (
      membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active &&
      membershipStatus !== TRIBE_MEMBERSHIP_STATUS.muted
    ) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.hidden,
        reason: TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible,
      };
    }

    const tribe = await tribeReadRepository.findBySlug(normalizedSlug);

    if (tribe) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.visible,
        tribe,
      };
    }

    return {
      status: TRIBE_PAGE_ACCESS_STATUS.hidden,
      reason: TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible,
    };
  };
}
