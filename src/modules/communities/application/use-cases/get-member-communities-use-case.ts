import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";

import type { MemberCommunityListItemResult } from "../results/member-community-list-item-result";

const MEMBER_COMMUNITIES_SORT_LOCALE = "es";
const MEMBER_COMMUNITIES_SORT_OPTIONS = {
  sensitivity: "base",
} as const;

type GetMemberCommunitiesDependencies = {
  communityReadRepository: CommunityReadRepository;
};

export function getMemberCommunities({
  communityReadRepository,
}: GetMemberCommunitiesDependencies) {
  return async (): Promise<MemberCommunityListItemResult[]> => {
    const communities =
      await communityReadRepository.listVisibleMembershipCommunities();

    return [...communities].sort((left, right) =>
      left.name.localeCompare(
        right.name,
        MEMBER_COMMUNITIES_SORT_LOCALE,
        MEMBER_COMMUNITIES_SORT_OPTIONS
      )
    );
  };
}
