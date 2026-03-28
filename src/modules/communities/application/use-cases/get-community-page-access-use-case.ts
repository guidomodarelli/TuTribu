import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";

import {
  COMMUNITY_MEMBERSHIP_STATUS,
  COMMUNITY_PAGE_ACCESS_REASON,
  COMMUNITY_PAGE_ACCESS_STATUS,
  type CommunityPageAccessResult,
} from "../results/community-page-access-result";

type GetCommunityPageAccessDependencies = {
  communityReadRepository: CommunityReadRepository;
};

export function getCommunityPageAccess({
  communityReadRepository,
}: GetCommunityPageAccessDependencies) {
  return async ({
    isAuthenticated,
    slug,
  }: {
    isAuthenticated: boolean;
    slug: string;
  }): Promise<CommunityPageAccessResult> => {
    const normalizedSlug = slug.trim().toLowerCase();

    if (normalizedSlug.length === 0) {
      return {
        status: COMMUNITY_PAGE_ACCESS_STATUS.hidden,
        reason: COMMUNITY_PAGE_ACCESS_REASON.notFoundOrNotVisible,
      };
    }

    if (!isAuthenticated) {
      return {
        status: COMMUNITY_PAGE_ACCESS_STATUS.hidden,
        reason: COMMUNITY_PAGE_ACCESS_REASON.unauthenticatedHidden,
      };
    }

    const community = await communityReadRepository.findBySlug(normalizedSlug);

    if (community) {
      return {
        status: COMMUNITY_PAGE_ACCESS_STATUS.visible,
        community,
      };
    }

    const membershipStatus =
      await communityReadRepository.findCurrentMembershipStatusBySlug(
        normalizedSlug
      );

    if (membershipStatus === COMMUNITY_MEMBERSHIP_STATUS.blocked) {
      return {
        status: COMMUNITY_PAGE_ACCESS_STATUS.hidden,
        reason: COMMUNITY_PAGE_ACCESS_REASON.blockedHidden,
      };
    }

    return {
      status: COMMUNITY_PAGE_ACCESS_STATUS.hidden,
      reason: COMMUNITY_PAGE_ACCESS_REASON.notFoundOrNotVisible,
    };
  };
}
