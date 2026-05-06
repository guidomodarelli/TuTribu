import { getTribePageAccess } from "@/src/modules/tribes/application/use-cases/get-tribe-page-access-use-case";

describe("getTribePageAccess", () => {
  it("returns unauthenticated hidden when the viewer is not authenticated", async () => {
    const execute = getTribePageAccess({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipTribes: jest.fn(),
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
    const execute = getTribePageAccess({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipTribes: jest.fn(),
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

  it("returns the visible tribe for active or muted readers", async () => {
    const execute = getTribePageAccess({
      tribeReadRepository: {
        findBySlug: jest.fn(async () => ({
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private" as const,
        })),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipTribes: jest.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "visible",
      tribe: {
        id: "tribe-1",
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
    const execute = getTribePageAccess({
      tribeReadRepository: {
        findBySlug: jest.fn(async () => null),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipTribes: jest.fn(),
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

  it("collapses missing or non-visible tribes into a generic hidden result", async () => {
    const execute = getTribePageAccess({
      tribeReadRepository: {
        findBySlug: jest.fn(async () => null),
        findCurrentMembershipStatusBySlug: jest.fn(async () => null),
        listVisibleMembershipTribes: jest.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "missing-tribe",
      })
    ).resolves.toEqual({
      status: "hidden",
      reason: "not_found_or_not_visible",
    });
  });
});
