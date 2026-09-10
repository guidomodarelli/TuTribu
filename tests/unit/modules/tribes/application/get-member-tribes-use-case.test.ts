import { vi, describe, it, expect } from "vitest";
import { getMemberTribes } from "@/src/modules/tribes/application/use-cases/get-member-tribes-use-case";

describe("getMemberTribes", () => {
  it("returns active and muted tribes sorted alphabetically by name", async () => {
    const listVisibleMembershipTribes = vi.fn(async () => [
      { logoUrl: null,
        tribeId: "tribe-2",
        membershipStatus: "muted" as const,
        name: "Zeta Club",
        role: "tribemate" as const,
        slug: "zeta-club",
      },
      { logoUrl: null,
        tribeId: "tribe-1",
        membershipStatus: "active" as const,
        name: "Alpha Club",
        role: "leader" as const,
        slug: "alpha-club",
      },
      { logoUrl: null,
        tribeId: "tribe-3",
        membershipStatus: "active" as const,
        name: "Beta Club",
        role: "guardian" as const,
        slug: "beta-club",
      },
    ]);
    const execute = getMemberTribes({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(),
        findCurrentMembershipStatusBySlug: vi.fn(),
        listVisibleMembershipTribes,
      },
    });

    await expect(execute()).resolves.toEqual([
      { logoUrl: null,
        tribeId: "tribe-1",
        membershipStatus: "active",
        name: "Alpha Club",
        role: "leader",
        slug: "alpha-club",
      },
      { logoUrl: null,
        tribeId: "tribe-3",
        membershipStatus: "active",
        name: "Beta Club",
        role: "guardian",
        slug: "beta-club",
      },
      { logoUrl: null,
        tribeId: "tribe-2",
        membershipStatus: "muted",
        name: "Zeta Club",
        role: "tribemate",
        slug: "zeta-club",
      },
    ]);
  });

  it("does not filter by role when the repository returns visible memberships", async () => {
    const listVisibleMembershipTribes = vi.fn(async () => [
      { logoUrl: null,
        tribeId: "tribe-1",
        membershipStatus: "active" as const,
        name: "Leaders",
        role: "leader" as const,
        slug: "leaders",
      },
      { logoUrl: null,
        tribeId: "tribe-2",
        membershipStatus: "muted" as const,
        name: "Guardiáns",
        role: "guardian" as const,
        slug: "guardians",
      },
      { logoUrl: null,
        tribeId: "tribe-3",
        membershipStatus: "active" as const,
        name: "Members",
        role: "tribemate" as const,
        slug: "tribemates",
      },
    ]);
    const execute = getMemberTribes({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(),
        findCurrentMembershipStatusBySlug: vi.fn(),
        listVisibleMembershipTribes,
      },
    });

    await expect(execute()).resolves.toHaveLength(3);
  });

  it("returns one visible membership per tribe when the repository returns duplicates", async () => {
    const listVisibleMembershipTribes = vi.fn(async () => [
      { logoUrl: null,
        tribeId: "tribe-1",
        membershipStatus: "active" as const,
        name: "Alpha Club",
        role: "tribemate" as const,
        slug: "alpha-club",
      },
      { logoUrl: null,
        tribeId: "tribe-1",
        membershipStatus: "muted" as const,
        name: "Alpha Club",
        role: "leader" as const,
        slug: "alpha-club",
      },
      { logoUrl: null,
        tribeId: "tribe-2",
        membershipStatus: "active" as const,
        name: "Beta Club",
        role: "guardian" as const,
        slug: "beta-club",
      },
    ]);
    const execute = getMemberTribes({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(),
        findCurrentMembershipStatusBySlug: vi.fn(),
        listVisibleMembershipTribes,
      },
    });

    await expect(execute()).resolves.toEqual([
      { logoUrl: null,
        tribeId: "tribe-1",
        membershipStatus: "active",
        name: "Alpha Club",
        role: "tribemate",
        slug: "alpha-club",
      },
      { logoUrl: null,
        tribeId: "tribe-2",
        membershipStatus: "active",
        name: "Beta Club",
        role: "guardian",
        slug: "beta-club",
      },
    ]);
  });
});
