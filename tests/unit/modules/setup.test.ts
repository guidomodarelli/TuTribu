import { createRequestModules } from "@/src/modules/setup";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

jest.mock("@/src/modules/shared/infrastructure/supabase/server-client", () => ({
  createServerSupabaseClient: jest.fn(),
}));

describe("createRequestModules", () => {
  it("creates a single Supabase client per request and shares it across modules", async () => {
    const supabaseClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: null,
          },
          error: null,
        }),
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
      rpc: jest.fn().mockResolvedValue({
        data: false,
        error: null,
      }),
    };

    (createServerSupabaseClient as jest.Mock).mockResolvedValue(supabaseClient);

    const modules = await createRequestModules();

    await modules.auth.useCases.getAuthenticatedMember();
    await modules.communities.useCases.getCommunityCreationEligibility({
      creatorEmail: "owner@example.com",
    });

    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(supabaseClient.auth.getUser).toHaveBeenCalledTimes(1);
    expect(supabaseClient.from).toHaveBeenCalledWith("community_creator_whitelist");
  });
});
