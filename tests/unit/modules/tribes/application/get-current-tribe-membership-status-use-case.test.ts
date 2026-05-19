import { getCurrentTribeMembershipStatus } from "@/src/modules/tribes/application/use-cases/get-current-tribe-membership-status-use-case";

describe("getCurrentTribeMembershipStatus", () => {
  it("returns null when slug is empty after trimming", async () => {
    const findCurrentMembershipStatusBySlug = jest.fn();
    const execute = getCurrentTribeMembershipStatus({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipAccessBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipTribes: jest.fn(),
      },
    });

    await expect(execute("   ")).resolves.toBeNull();
    expect(findCurrentMembershipStatusBySlug).not.toHaveBeenCalled();
  });

  it("normalizes slug and returns active membership status", async () => {
    const findCurrentMembershipStatusBySlug = jest.fn(async () => "active" as const);
    const execute = getCurrentTribeMembershipStatus({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipAccessBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipTribes: jest.fn(),
      },
    });

    await expect(execute("  Matematica-Pro  ")).resolves.toBe("active");
    expect(findCurrentMembershipStatusBySlug).toHaveBeenCalledWith("matematica-pro");
  });

  it("returns owner read status for the configured platform owner", async () => {
    const findCurrentMembershipStatusBySlug = jest.fn(
      async () => "owner_read" as const
    );
    const execute = getCurrentTribeMembershipStatus({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipAccessBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipTribes: jest.fn(),
      },
    });

    await expect(execute("matematica-pro")).resolves.toBe("owner_read");
  });
});
