import { getMemberCommunities } from "@/src/modules/communities/application/use-cases/get-member-communities-use-case";

describe("getMemberCommunities", () => {
  it("returns active and muted communities sorted alphabetically by name", async () => {
    const listVisibleMembershipCommunities = jest.fn(async () => [
      {
        communityId: "community-2",
        name: "Zeta Club",
        slug: "zeta-club",
      },
      {
        communityId: "community-1",
        name: "Alpha Club",
        slug: "alpha-club",
      },
      {
        communityId: "community-3",
        name: "Beta Club",
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
        slug: "alpha-club",
      },
      {
        communityId: "community-3",
        name: "Beta Club",
        slug: "beta-club",
      },
      {
        communityId: "community-2",
        name: "Zeta Club",
        slug: "zeta-club",
      },
    ]);
  });

  it("does not filter by role when the repository returns visible memberships", async () => {
    const listVisibleMembershipCommunities = jest.fn(async () => [
      {
        communityId: "community-1",
        name: "Owners",
        slug: "owners",
      },
      {
        communityId: "community-2",
        name: "Admins",
        slug: "admins",
      },
      {
        communityId: "community-3",
        name: "Members",
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
