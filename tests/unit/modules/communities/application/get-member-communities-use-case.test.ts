import { getMemberCommunities } from "@/src/modules/communities/application/use-cases/get-member-communities-use-case";

describe("getMemberCommunities", () => {
  it("returns active and muted communities sorted alphabetically by name", async () => {
    const listVisibleMembershipCommunities = jest.fn(async () => [
      {
        communityId: "community-2",
        name: "Zeta Club",
        role: "member" as const,
        slug: "zeta-club",
      },
      {
        communityId: "community-1",
        name: "Alpha Club",
        role: "owner" as const,
        slug: "alpha-club",
      },
      {
        communityId: "community-3",
        name: "Beta Club",
        role: "admin" as const,
        slug: "beta-club",
      },
    ]);
    const execute = getMemberCommunities({
      communityReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipCommunities,
      },
    });

    await expect(execute()).resolves.toEqual([
      {
        communityId: "community-1",
        name: "Alpha Club",
        role: "owner",
        slug: "alpha-club",
      },
      {
        communityId: "community-3",
        name: "Beta Club",
        role: "admin",
        slug: "beta-club",
      },
      {
        communityId: "community-2",
        name: "Zeta Club",
        role: "member",
        slug: "zeta-club",
      },
    ]);
  });

  it("does not filter by role when the repository returns visible memberships", async () => {
    const listVisibleMembershipCommunities = jest.fn(async () => [
      {
        communityId: "community-1",
        name: "Owners",
        role: "owner" as const,
        slug: "owners",
      },
      {
        communityId: "community-2",
        name: "Admins",
        role: "admin" as const,
        slug: "admins",
      },
      {
        communityId: "community-3",
        name: "Members",
        role: "member" as const,
        slug: "members",
      },
    ]);
    const execute = getMemberCommunities({
      communityReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipCommunities,
      },
    });

    await expect(execute()).resolves.toHaveLength(3);
  });
});
