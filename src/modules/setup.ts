import { buildAuthModule } from "./auth/setup";
import { buildCommunitiesModule } from "./communities/setup";
import { SupabaseAuthSessionRepository } from "./auth/infrastructure/repositories/supabase-auth-session-repository";
import { SupabaseCommunityCreationRepository } from "./communities/infrastructure/repositories/supabase-community-creation-repository";
import { SupabaseCommunityCreatorWhitelistRepository } from "./communities/infrastructure/repositories/supabase-community-creator-whitelist-repository";
import { SupabaseCommunityReadRepository } from "./communities/infrastructure/repositories/supabase-community-read-repository";
import { createServerSupabaseClient } from "./shared/infrastructure/supabase/server-client";

type RequestScopedSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function createRequestScopedClientFactory(supabaseClient: RequestScopedSupabaseClient) {
  return async () => supabaseClient;
}

export async function createRequestModules() {
  const supabaseClient = await createServerSupabaseClient();
  const createClient = createRequestScopedClientFactory(supabaseClient);

  return {
    auth: buildAuthModule({
      authSessionRepository: new SupabaseAuthSessionRepository(createClient),
    }),
    communities: buildCommunitiesModule({
      communityReadRepository: new SupabaseCommunityReadRepository(createClient),
      communityCreationRepository: new SupabaseCommunityCreationRepository(
        createClient
      ),
      communityCreatorWhitelistRepository:
        new SupabaseCommunityCreatorWhitelistRepository(createClient),
    }),
  };
}
