import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";

import type { CommunityResult } from "../results/community-result";

export class GetCommunityBySlugUseCase {
  constructor(private readonly communityReadRepository: CommunityReadRepository) {}

  async execute({ slug }: { slug: string }): Promise<CommunityResult | null> {
    return this.communityReadRepository.findBySlug(slug.trim().toLowerCase());
  }
}
