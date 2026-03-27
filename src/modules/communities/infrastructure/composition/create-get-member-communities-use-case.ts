import { GetMemberCommunitiesUseCase } from "@/src/modules/communities/application/use-cases/get-member-communities-use-case";

import { SupabaseCommunityReadRepository } from "../repositories/supabase-community-read-repository";

export function createGetMemberCommunitiesUseCase(): GetMemberCommunitiesUseCase {
  return new GetMemberCommunitiesUseCase(new SupabaseCommunityReadRepository());
}
