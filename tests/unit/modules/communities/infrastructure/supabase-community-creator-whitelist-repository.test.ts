import { SupabaseCommunityCreatorWhitelistRepository } from "@/src/modules/communities/infrastructure/repositories/supabase-community-creator-whitelist-repository";

describe("SupabaseCommunityCreatorWhitelistRepository", () => {
  it("checks the whitelist with a normalized email", async () => {
    const maybeSingle = jest.fn(async () => ({
      data: {
        email: "prometido@example.com",
      },
      error: null,
    }));
    const eq = jest.fn(() => ({
      maybeSingle,
    }));
    const select = jest.fn(() => ({
      eq,
    }));
    const from = jest.fn(() => ({
      select,
    }));

    const repository = new SupabaseCommunityCreatorWhitelistRepository(async () => ({
      from,
    }));

    await expect(
      repository.isEmailAllowed("  PROMETIDO@Example.com ")
    ).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith("community_creator_whitelist");
    expect(eq).toHaveBeenCalledWith("email", "prometido@example.com");
  });

  it("returns false when the email is not present in the whitelist", async () => {
    const repository = new SupabaseCommunityCreatorWhitelistRepository(async () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    }));

    await expect(repository.isEmailAllowed("missing@example.com")).resolves.toBe(false);
  });

  it("returns false when the whitelist table is not yet available in Supabase", async () => {
    const repository = new SupabaseCommunityCreatorWhitelistRepository(async () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: {
                code: "PGRST205",
                message:
                  "Could not find the table 'public.community_creator_whitelist' in the schema cache",
              },
            }),
          }),
        }),
      }),
    }));

    await expect(repository.isEmailAllowed("missing@example.com")).resolves.toBe(false);
  });
});
