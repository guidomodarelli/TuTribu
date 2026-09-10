import { vi, describe, it, expect } from "vitest";
import { getTribePageAccess } from "@/src/modules/tribes/application/use-cases/get-tribe-page-access-use-case";

describe("getTribePageAccess", () => {
  it("returns unauthenticated hidden when the viewer is not authenticated", async () => {
    const execute = getTribePageAccess({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(),
        findCurrentMembershipAccessBySlug: vi.fn(),
        findCurrentMembershipStatusBySlug: vi.fn(),
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: false,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "hidden" as const,
      reason: "unauthenticated_hidden",
    });
  });

  it("collapses an empty slug into a generic hidden result", async () => {
    const execute = getTribePageAccess({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(),
        findCurrentMembershipAccessBySlug: vi.fn(),
        findCurrentMembershipStatusBySlug: vi.fn(),
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "   ",
      })
    ).resolves.toEqual({
      status: "hidden" as const,
      reason: "not_found_or_not_visible",
    });
  });

  it("returns the visible tribe for active readers", async () => {
    const execute = getTribePageAccess({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(async () => ({
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private" as const,
        })),
        findCurrentMembershipAccessBySlug: vi.fn(async () => ({
          status: "active" as const,
          statusReason: "none" as const,
        })),
        findCurrentMembershipStatusBySlug: vi.fn(async () => "active" as const),
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "visible" as const,
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
  });

  it("uses the combined membership and tribe lookup for visible readers", async () => {
    const findBySlug = vi.fn();
    const findCurrentMembershipAccessBySlug = vi.fn();
    const findCurrentMembershipAccessWithTribeBySlug = vi.fn(async () => ({
      membershipAccess: {
        status: "active" as const,
        statusReason: "none" as const,
      },
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private" as const,
      },
    }));
    const execute = getTribePageAccess({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug,
        findCurrentMembershipAccessBySlug,
        findCurrentMembershipAccessWithTribeBySlug,
        findCurrentMembershipStatusBySlug: vi.fn(async () => "active" as const),
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "Matematica-Pro",
      })
    ).resolves.toEqual({
      status: "visible" as const,
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });

    expect(findCurrentMembershipAccessWithTribeBySlug).toHaveBeenCalledWith(
      "matematica-pro"
    );
    expect(findCurrentMembershipAccessBySlug).not.toHaveBeenCalled();
    expect(findBySlug).not.toHaveBeenCalled();
  });

  it("returns the visible tribe for muted readers", async () => {
    const execute = getTribePageAccess({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(async () => ({
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private" as const,
        })),
        findCurrentMembershipAccessBySlug: vi.fn(async () => ({
          status: "muted" as const,
          statusReason: "none" as const,
        })),
        findCurrentMembershipStatusBySlug: vi.fn(async () => "muted" as const),
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "visible" as const,
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
  });

  it("hides private tribes when the authenticated viewer has no membership", async () => {
    const execute = getTribePageAccess({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(async () => ({
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private" as const,
        })),
        findCurrentMembershipAccessBySlug: vi.fn(async () => null),
        findCurrentMembershipStatusBySlug: vi.fn(async () => null),
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "hidden" as const,
      reason: "not_found_or_not_visible",
    });
  });

  it("returns blocked hidden when the current membership is blocked", async () => {
    const findCurrentMembershipAccessBySlug = vi.fn(async () => ({
      status: "blocked" as const,
      statusReason: "conduct_blocked" as const,
    }));
    const execute = getTribePageAccess({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(async () => ({
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private" as const,
        })),
        findCurrentMembershipAccessBySlug,
        findCurrentMembershipStatusBySlug: vi.fn(),
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "hidden" as const,
      blockedReason: "conduct_blocked",
      reason: "blocked_hidden",
    });

    expect(findCurrentMembershipAccessBySlug).toHaveBeenCalledWith("matematica-pro");
  });

  it("collapses missing or non-visible tribes into a generic hidden result", async () => {
    const findCurrentMembershipAccessBySlug = vi.fn(async () => null);
    const findCurrentMembershipStatusBySlug = vi.fn();
    const execute = getTribePageAccess({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(async () => null),
        findCurrentMembershipAccessBySlug,
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        isAuthenticated: true,
        slug: "missing-tribe",
      })
    ).resolves.toEqual({
      status: "hidden" as const,
      reason: "not_found_or_not_visible",
    });
    expect(findCurrentMembershipStatusBySlug).not.toHaveBeenCalled();
  });
});
