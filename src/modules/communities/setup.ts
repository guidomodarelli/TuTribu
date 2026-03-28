import { createCommunity } from "@/src/modules/communities/application/use-cases/create-community-use-case";
import { getCommunityBySlug } from "@/src/modules/communities/application/use-cases/get-community-by-slug-use-case";
import { getCommunityCreationEligibility } from "@/src/modules/communities/application/use-cases/get-community-creation-eligibility-use-case";
import { getCommunityPageAccess } from "@/src/modules/communities/application/use-cases/get-community-page-access-use-case";
import { getMemberCommunities } from "@/src/modules/communities/application/use-cases/get-member-communities-use-case";
import type { CommunityCreationRepository } from "@/src/modules/communities/domain/repositories/community-creation-repository";
import type { CommunityCreatorWhitelistRepository } from "@/src/modules/communities/domain/repositories/community-creator-whitelist-repository";
import type { CommunityReadRepository } from "@/src/modules/communities/domain/repositories/community-read-repository";

type CommunitiesModuleDependencies = {
  communityReadRepository: CommunityReadRepository;
  communityCreationRepository: CommunityCreationRepository;
  communityCreatorWhitelistRepository: CommunityCreatorWhitelistRepository;
};

export function buildCommunitiesModule({
  communityReadRepository,
  communityCreationRepository,
  communityCreatorWhitelistRepository,
}: CommunitiesModuleDependencies) {
  return {
    useCases: {
      createCommunity: createCommunity({
        communityCreatorWhitelistRepository,
        communityCreationRepository,
      }),
      getCommunityBySlug: getCommunityBySlug({
        communityReadRepository,
      }),
      getCommunityCreationEligibility: getCommunityCreationEligibility({
        communityCreatorWhitelistRepository,
      }),
      getCommunityPageAccess: getCommunityPageAccess({
        communityReadRepository,
      }),
      getMemberCommunities: getMemberCommunities({
        communityReadRepository,
      }),
    },
  };
}
