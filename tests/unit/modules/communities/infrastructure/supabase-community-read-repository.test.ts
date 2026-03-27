import { SupabaseCommunityReadRepository } from "@/src/modules/communities/infrastructure/repositories/supabase-community-read-repository";

describe("SupabaseCommunityReadRepository", () => {
  it("returns a visible community when the row is readable through RLS", async () => {
    const maybeSingle = jest.fn(async () => ({
      data: {
        id: "community-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
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

    const repository = new SupabaseCommunityReadRepository(async () => ({
      from,
      rpc: jest.fn(),
    }));

    await expect(repository.findBySlug("matematica-pro")).resolves.toEqual({
      id: "community-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });
  });

  it("returns the current membership status through the diagnostic RPC", async () => {
    const rpc = jest.fn(async () => ({
      data: "blocked",
      error: null,
    }));

    const repository = new SupabaseCommunityReadRepository(async () => ({
      from: jest.fn(),
      rpc,
    }));

    await expect(
      repository.findCurrentMembershipStatusBySlug("matematica-pro")
    ).resolves.toBe("blocked");

    expect(rpc).toHaveBeenCalledWith(
      "get_current_community_membership_status_by_slug",
      {
        target_slug: "matematica-pro",
      }
    );
  });

  it("lists visible membership communities for the current member", async () => {
    const order = jest.fn(async () => ({
      data: [
        {
          community_id: "community-1",
          communities: {
            id: "community-1",
            name: "Alpha Club",
            slug: "alpha-club",
          },
        },
        {
          community_id: "community-2",
          communities: {
            id: "community-2",
            name: "Beta Club",
            slug: "beta-club",
          },
        },
      ],
      error: null,
    }));
    const inMock = jest.fn(() => ({
      order,
    }));
    const select = jest.fn(() => ({
      in: inMock,
    }));
    const from = jest.fn(() => ({
      select,
    }));

    const repository = new SupabaseCommunityReadRepository(async () => ({
      from,
      rpc: jest.fn(),
    }));

    await expect(repository.listVisibleMembershipCommunities()).resolves.toEqual([
      {
        communityId: "community-1",
        name: "Alpha Club",
        slug: "alpha-club",
      },
      {
        communityId: "community-2",
        name: "Beta Club",
        slug: "beta-club",
      },
    ]);

    expect(from).toHaveBeenCalledWith("community_members");
    expect(inMock).toHaveBeenCalledWith("status", ["active", "muted"]);
  });
});
