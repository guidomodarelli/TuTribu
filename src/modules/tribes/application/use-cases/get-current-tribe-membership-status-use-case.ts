import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";

type GetCurrentTribeMembershipStatusDependencies = {
  tribeReadRepository: TribeReadRepository;
};

export function getCurrentTribeMembershipStatus({
  tribeReadRepository,
}: GetCurrentTribeMembershipStatusDependencies) {
  return async (slug: string) => {
    const normalizedSlug = slug.trim().toLowerCase();

    if (!normalizedSlug) {
      return null;
    }

    const membershipStatus =
      await tribeReadRepository.findCurrentMembershipStatusBySlug(
        normalizedSlug
      );

    if (
      membershipStatus === TRIBE_MEMBERSHIP_STATUS.active ||
      membershipStatus === TRIBE_MEMBERSHIP_STATUS.muted ||
      membershipStatus === TRIBE_MEMBERSHIP_STATUS.blocked
    ) {
      return membershipStatus;
    }

    return null;
  };
}
