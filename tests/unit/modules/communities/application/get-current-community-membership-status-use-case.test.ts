import { getCurrentCommunityMembershipStatus } from "@/src/modules/communities/application/use-cases/get-current-community-membership-status-use-case";

describe("getCurrentCommunityMembershipStatus", () => {
  it("returns null when slug is empty after trimming", async () => {
    const findCurrentMembershipStatusBySlug = jest.fn();
    const execute = getCurrentCommunityMembershipStatus({
      communityReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipCommunities: jest.fn(),
      },
    });

    await expect(execute("   ")).resolves.toBeNull();
    expect(findCurrentMembershipStatusBySlug).not.toHaveBeenCalled();
  });

  it("normalizes slug and returns active membership status", async () => {
    const findCurrentMembershipStatusBySlug = jest.fn(async () => "active" as const);
    const execute = getCurrentCommunityMembershipStatus({
      communityReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipCommunities: jest.fn(),
      },
    });

    await expect(execute("  Matematica-Pro  ")).resolves.toBe("active");
    expect(findCurrentMembershipStatusBySlug).toHaveBeenCalledWith("matematica-pro");
  });
});
