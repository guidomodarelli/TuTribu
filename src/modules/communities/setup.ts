import { createCommunity } from "@/src/modules/communities/application/use-cases/create-community-use-case";
import { getCommunityBySlug } from "@/src/modules/communities/application/use-cases/get-community-by-slug-use-case";
import { getCommunityCreationEligibility } from "@/src/modules/communities/application/use-cases/get-community-creation-eligibility-use-case";
import { getCommunityPageAccess } from "@/src/modules/communities/application/use-cases/get-community-page-access-use-case";
import { getMemberCommunities } from "@/src/modules/communities/application/use-cases/get-member-communities-use-case";
import { SupabaseCommunityCreationRepository } from "@/src/modules/communities/infrastructure/repositories/supabase-community-creation-repository";
import { SupabaseCommunityCreatorWhitelistRepository } from "@/src/modules/communities/infrastructure/repositories/supabase-community-creator-whitelist-repository";
import { SupabaseCommunityReadRepository } from "@/src/modules/communities/infrastructure/repositories/supabase-community-read-repository";

export function createCommunitiesModule() {
  const communityReadRepository = new SupabaseCommunityReadRepository();
  const communityCreationRepository = new SupabaseCommunityCreationRepository();
  const communityCreatorWhitelistRepository =
    new SupabaseCommunityCreatorWhitelistRepository();

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
