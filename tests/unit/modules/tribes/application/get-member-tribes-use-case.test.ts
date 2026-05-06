import { getMemberTribes } from "@/src/modules/tribes/application/use-cases/get-member-tribes-use-case";

describe("getMemberTribes", () => {
  it("returns active and muted tribes sorted alphabetically by name", async () => {
    const listVisibleMembershipTribes = jest.fn(async () => [
      {
        tribeId: "tribe-2",
        name: "Zeta Club",
        role: "member" as const,
        slug: "zeta-club",
      },
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        role: "owner" as const,
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-3",
        name: "Beta Club",
        role: "admin" as const,
        slug: "beta-club",
      },
    ]);
    const execute = getMemberTribes({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipTribes,
      },
    });

    await expect(execute()).resolves.toEqual([
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        role: "owner",
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-3",
        name: "Beta Club",
        role: "admin",
        slug: "beta-club",
      },
      {
        tribeId: "tribe-2",
        name: "Zeta Club",
        role: "member",
        slug: "zeta-club",
      },
    ]);
  });

  it("does not filter by role when the repository returns visible memberships", async () => {
    const listVisibleMembershipTribes = jest.fn(async () => [
      {
        tribeId: "tribe-1",
        name: "Owners",
        role: "owner" as const,
        slug: "owners",
      },
      {
        tribeId: "tribe-2",
        name: "Admins",
        role: "admin" as const,
        slug: "admins",
      },
      {
        tribeId: "tribe-3",
        name: "Members",
        role: "member" as const,
        slug: "members",
      },
    ]);
    const execute = getMemberTribes({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipTribes,
      },
    });

    await expect(execute()).resolves.toHaveLength(3);
  });
});
