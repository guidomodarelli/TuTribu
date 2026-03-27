import { CreateCommunityUseCase } from "@/src/modules/communities/application/use-cases/create-community-use-case";

import { SupabaseCommunityCreationRepository } from "../repositories/supabase-community-creation-repository";
import { SupabaseCommunityCreatorWhitelistRepository } from "../repositories/supabase-community-creator-whitelist-repository";

export function createCreateCommunityUseCase(): CreateCommunityUseCase {
  return new CreateCommunityUseCase(
    new SupabaseCommunityCreatorWhitelistRepository(),
    new SupabaseCommunityCreationRepository()
  );
}
