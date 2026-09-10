import { vi, describe, it, expect } from "vitest";
import { getTribeBySlug } from "@/src/modules/tribes/application/use-cases/get-tribe-by-slug-use-case";

describe("getTribeBySlug", () => {
  it("normalizes the slug before querying the repository", async () => {
    const findBySlug = vi.fn(async () => ({
      id: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private" as const,
    }));
    const execute = getTribeBySlug({
      tribeReadRepository: { listVisibleTribeMembersBySlug: vi.fn(),
        findBySlug,
        findCurrentMembershipStatusBySlug: vi.fn(),
        listVisibleMembershipTribes: vi.fn(),
      },
    });

    await expect(
      execute({
        slug: "  Matematica-Pro  ",
      })
    ).resolves.toEqual({
      id: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });

    expect(findBySlug).toHaveBeenCalledWith("matematica-pro");
  });
});
