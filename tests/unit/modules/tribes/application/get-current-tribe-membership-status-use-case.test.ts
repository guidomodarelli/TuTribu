import { vi, describe, it, expect } from "vitest";
import { getCurrentTribeMembershipStatus } from "@/src/modules/tribes/application/use-cases/get-current-tribe-membership-status-use-case";

describe("getCurrentTribeMembershipStatus", () => {
  it("returns null when slug is empty after trimming", async () => {
    const findCurrentMembershipStatusBySlug = vi.fn();
    const execute = getCurrentTribeMembershipStatus({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(),
        findCurrentMembershipAccessBySlug: vi.fn(),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(execute("   ")).resolves.toBeNull();
    expect(findCurrentMembershipStatusBySlug).not.toHaveBeenCalled();
  });

  it("normalizes slug and returns active membership status", async () => {
    const findCurrentMembershipStatusBySlug = vi.fn(async () => "active" as const);
    const execute = getCurrentTribeMembershipStatus({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug: vi.fn(),
        findCurrentMembershipAccessBySlug: vi.fn(),
        findCurrentMembershipStatusBySlug,
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(execute("  Matematica-Pro  ")).resolves.toBe("active");
    expect(findCurrentMembershipStatusBySlug).toHaveBeenCalledWith("matematica-pro");
  });
});
