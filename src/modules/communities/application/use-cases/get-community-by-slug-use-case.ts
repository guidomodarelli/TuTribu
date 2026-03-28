import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";

import type { CommunityResult } from "../results/community-result";

type GetCommunityBySlugDependencies = {
  communityReadRepository: CommunityReadRepository;
};

export function getCommunityBySlug({
  communityReadRepository,
}: GetCommunityBySlugDependencies) {
  return async ({ slug }: { slug: string }): Promise<CommunityResult | null> => {
    return communityReadRepository.findBySlug(slug.trim().toLowerCase());
  };
}
