import { getCommunityPageAccess } from "@/src/modules/communities/application/use-cases/get-community-page-access-use-case";

describe("getCommunityPageAccess", () => {
  it("returns unauthenticated hidden when the viewer is not authenticated", async () => {
    const execute = getCommunityPageAccess({
      communityReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipCommunities: jest.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: false,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "hidden",
      reason: "unauthenticated_hidden",
    });
  });

  it("collapses an empty slug into a generic hidden result", async () => {
    const execute = getCommunityPageAccess({
      communityReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipCommunities: jest.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "   ",
      })
    ).resolves.toEqual({
      status: "hidden",
      reason: "not_found_or_not_visible",
    });
  });

  it("returns the visible community for active or muted readers", async () => {
    const execute = getCommunityPageAccess({
      communityReadRepository: {
        findBySlug: jest.fn(async () => ({
          id: "community-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private" as const,
        })),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipCommunities: jest.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "visible",
      community: {
        id: "community-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
  });

  it("returns blocked hidden when the current membership is blocked", async () => {
    const findCurrentMembershipStatusBySlug = jest.fn(
      async (): Promise<"blocked"> => "blocked"
    );
    const execute = getCommunityPageAccess({
      communityReadRepository: {
        findBySlug: jest.fn(async () => null),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipCommunities: jest.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "hidden",
      reason: "blocked_hidden",
    });

    expect(findCurrentMembershipStatusBySlug).toHaveBeenCalledWith("matematica-pro");
  });

  it("collapses missing or non-visible communities into a generic hidden result", async () => {
    const execute = getCommunityPageAccess({
      communityReadRepository: {
        findBySlug: jest.fn(async () => null),
        findCurrentMembershipStatusBySlug: jest.fn(async () => null),
        listVisibleMembershipCommunities: jest.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "missing-community",
      })
    ).resolves.toEqual({
      status: "hidden",
      reason: "not_found_or_not_visible",
    });
  });
});
