import { getCommunityBySlug } from "@/src/modules/communities/application/use-cases/get-community-by-slug-use-case";

describe("getCommunityBySlug", () => {
  it("normalizes the slug before querying the repository", async () => {
    const findBySlug = jest.fn(async () => ({
      id: "community-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private" as const,
    }));
    const execute = getCommunityBySlug({
      communityReadRepository: {
        findBySlug,
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipCommunities: jest.fn(),
      },
    });

    await expect(
      execute({
        slug: "  Matematica-Pro  ",
      })
    ).resolves.toEqual({
      id: "community-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });

    expect(findBySlug).toHaveBeenCalledWith("matematica-pro");
  });
});
