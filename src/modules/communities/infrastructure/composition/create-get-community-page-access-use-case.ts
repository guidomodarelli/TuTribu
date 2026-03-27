import { GetCommunityPageAccessUseCase } from "@/src/modules/communities/application/use-cases/get-community-page-access-use-case";

import { SupabaseCommunityReadRepository } from "../repositories/supabase-community-read-repository";

export function createGetCommunityPageAccessUseCase(): GetCommunityPageAccessUseCase {
  return new GetCommunityPageAccessUseCase(new SupabaseCommunityReadRepository());
}
