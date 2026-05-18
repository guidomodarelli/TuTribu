import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";
import type {
  TribeMembershipAccess,
  TribeReadRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-read-repository";

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

type TribePageAccessLookup = {
  includesTribe: boolean;
  membershipAccess: TribeMembershipAccess | null;
  tribe: Tribe | null;
};

async function findTribePageAccessLookup({
  normalizedSlug,
  tribeReadRepository,
}: {
  normalizedSlug: string;
  tribeReadRepository: TribeReadRepository;
}): Promise<TribePageAccessLookup> {
  if (tribeReadRepository.findCurrentMembershipAccessWithTribeBySlug) {
    const membershipAccessWithTribe =
      await tribeReadRepository.findCurrentMembershipAccessWithTribeBySlug(
        normalizedSlug
      );

    return {
      includesTribe: true,
      membershipAccess: membershipAccessWithTribe?.membershipAccess ?? null,
      tribe: membershipAccessWithTribe?.tribe ?? null,
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

  return {
    includesTribe: false,
    membershipAccess,
    tribe: null,
  };
}

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

    const pageAccessLookup = await findTribePageAccessLookup({
      normalizedSlug,
      tribeReadRepository,
    });
    const membershipStatus = pageAccessLookup.membershipAccess?.status ?? null;

    if (
      membershipStatus === TRIBE_MEMBERSHIP_STATUS.blocked ||
      membershipStatus === TRIBE_MEMBERSHIP_STATUS.removed
    ) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.hidden,
        blockedReason:
          pageAccessLookup.membershipAccess?.statusReason ??
          TRIBE_MEMBERSHIP_STATUS_REASON.none,
        reason: TRIBE_PAGE_ACCESS_REASON.blockedHidden,
      };
    }

    if (
      membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active &&
      membershipStatus !== TRIBE_MEMBERSHIP_STATUS.muted &&
      membershipStatus !== TRIBE_MEMBERSHIP_STATUS.ownerRead
    ) {
      return {
        status: TRIBE_PAGE_ACCESS_STATUS.hidden,
        reason: TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible,
      };
    }

    const tribe = pageAccessLookup.includesTribe
      ? pageAccessLookup.tribe
      : await tribeReadRepository.findBySlug(normalizedSlug);

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
