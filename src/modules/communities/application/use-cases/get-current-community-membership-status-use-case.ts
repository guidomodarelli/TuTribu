import { COMMUNITY_MEMBERSHIP_STATUS } from "@/src/modules/communities/constants/community-page-access";
import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";

type GetCurrentCommunityMembershipStatusDependencies = {
  communityReadRepository: CommunityReadRepository;
};

export function getCurrentCommunityMembershipStatus({
  communityReadRepository,
}: GetCurrentCommunityMembershipStatusDependencies) {
  return async (slug: string) => {
    const normalizedSlug = slug.trim().toLowerCase();

    if (!normalizedSlug) {
      return null;
    }

    const membershipStatus =
      await communityReadRepository.findCurrentMembershipStatusBySlug(
        normalizedSlug
      );

    if (
      membershipStatus === COMMUNITY_MEMBERSHIP_STATUS.active ||
      membershipStatus === COMMUNITY_MEMBERSHIP_STATUS.muted ||
      membershipStatus === COMMUNITY_MEMBERSHIP_STATUS.blocked
    ) {
      return membershipStatus;
    }

    return null;
  };
}
