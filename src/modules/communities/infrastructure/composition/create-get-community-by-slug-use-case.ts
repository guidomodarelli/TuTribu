import { GetCommunityBySlugUseCase } from "@/src/modules/communities/application/use-cases/get-community-by-slug-use-case";

import { SupabaseCommunityReadRepository } from "../repositories/supabase-community-read-repository";

export function createGetCommunityBySlugUseCase(): GetCommunityBySlugUseCase {
  return new GetCommunityBySlugUseCase(new SupabaseCommunityReadRepository());
}
