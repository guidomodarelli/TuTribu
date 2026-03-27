import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";

import type { MemberCommunityListItemResult } from "../results/member-community-list-item-result";

export class GetMemberCommunitiesUseCase {
  constructor(private readonly communityReadRepository: CommunityReadRepository) {}

  async execute(): Promise<MemberCommunityListItemResult[]> {
    const communities =
      await this.communityReadRepository.listVisibleMembershipCommunities();

    return [...communities].sort((left, right) =>
      left.name.localeCompare(right.name, "es", {
        sensitivity: "base",
      })
    );
  }
}
