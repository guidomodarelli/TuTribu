import { GetCommunityCreationEligibilityUseCase } from "@/src/modules/communities/application/use-cases/get-community-creation-eligibility-use-case";

import { SupabaseCommunityCreatorWhitelistRepository } from "../repositories/supabase-community-creator-whitelist-repository";

export function createGetCommunityCreationEligibilityUseCase(): GetCommunityCreationEligibilityUseCase {
  return new GetCommunityCreationEligibilityUseCase(
    new SupabaseCommunityCreatorWhitelistRepository()
  );
}
