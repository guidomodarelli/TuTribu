import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";

import type { CommunityPageAccessResult } from "../results/community-page-access-result";

export class GetCommunityPageAccessUseCase {
  constructor(private readonly communityReadRepository: CommunityReadRepository) {}

  async execute({
    isAuthenticated,
    slug,
  }: {
    isAuthenticated: boolean;
    slug: string;
  }): Promise<CommunityPageAccessResult> {
    const normalizedSlug = slug.trim().toLowerCase();

    if (normalizedSlug.length === 0) {
      return {
        status: "hidden",
        reason: "not_found_or_not_visible",
      };
    }

    if (!isAuthenticated) {
      return {
        status: "hidden",
        reason: "unauthenticated_hidden",
      };
    }

    const community = await this.communityReadRepository.findBySlug(normalizedSlug);

    if (community) {
      return {
        status: "visible",
        community,
      };
    }

    const membershipStatus =
      await this.communityReadRepository.findCurrentMembershipStatusBySlug(
        normalizedSlug
      );

    if (membershipStatus === "blocked") {
      return {
        status: "hidden",
        reason: "blocked_hidden",
      };
    }

    return {
      status: "hidden",
      reason: "not_found_or_not_visible",
    };
  }
}
