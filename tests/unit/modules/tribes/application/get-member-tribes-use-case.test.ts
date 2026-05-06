import { getMemberTribes } from "@/src/modules/tribes/application/use-cases/get-member-tribes-use-case";

describe("getMemberTribes", () => {
  it("returns active and muted tribes sorted alphabetically by name", async () => {
    const listVisibleMembershipTribes = jest.fn(async () => [
      {
        tribeId: "tribe-2",
        name: "Zeta Club",
        role: "tribemate" as const,
        slug: "zeta-club",
      },
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        role: "leader" as const,
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-3",
        name: "Beta Club",
        role: "guardian" as const,
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
        role: "leader",
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-3",
        name: "Beta Club",
        role: "guardian",
        slug: "beta-club",
      },
      {
        tribeId: "tribe-2",
        name: "Zeta Club",
        role: "tribemate",
        slug: "zeta-club",
      },
    ]);
  });

  it("does not filter by role when the repository returns visible memberships", async () => {
    const listVisibleMembershipTribes = jest.fn(async () => [
      {
        tribeId: "tribe-1",
        name: "Leaders",
        role: "leader" as const,
        slug: "leaders",
      },
      {
        tribeId: "tribe-2",
        name: "Guardiáns",
        role: "guardian" as const,
        slug: "guardians",
      },
      {
        tribeId: "tribe-3",
        name: "Members",
        role: "tribemate" as const,
        slug: "tribemates",
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

  it("returns one visible membership per tribe when the repository returns duplicates", async () => {
    const listVisibleMembershipTribes = jest.fn(async () => [
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        role: "tribemate" as const,
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        role: "leader" as const,
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-2",
        name: "Beta Club",
        role: "guardian" as const,
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
        role: "tribemate",
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-2",
        name: "Beta Club",
        role: "guardian",
        slug: "beta-club",
      },
    ]);
  });
});
