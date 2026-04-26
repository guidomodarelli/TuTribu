import { PostgresCommunityReadRepository } from "@/src/modules/communities/infrastructure/repositories/postgres-community-read-repository";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

describe("PostgresCommunityReadRepository", () => {
  it("returns a visible community when the row is readable through RLS", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          id: "community-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private",
        },
      ],
    }));

    const repository = new PostgresCommunityReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.findBySlug("matematica-pro")).resolves.toEqual({
      id: "community-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });
  });

  it("returns the current membership status through the diagnostic function that preserves blocked-member detection", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "blocked" }],
    }));

    const repository = new PostgresCommunityReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.findCurrentMembershipStatusBySlug("matematica-pro")
    ).resolves.toBe("blocked");

    expect(execute).toHaveBeenCalledTimes(1);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "select public.get_current_community_membership_status_by_slug("
    );
  });

  it("lists visible membership communities for the current member", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          community_id: "community-1",
          community_row_id: "community-1",
          name: "Alpha Club",
          role: "owner",
          slug: "alpha-club",
        },
        {
          community_id: "community-2",
          community_row_id: "community-2",
          name: "Beta Club",
          role: "member",
          slug: "beta-club",
        },
      ],
    }));

    const repository = new PostgresCommunityReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.listVisibleMembershipCommunities()).resolves.toEqual([
      {
        communityId: "community-1",
        name: "Alpha Club",
        role: "owner",
        slug: "alpha-club",
      },
      {
        communityId: "community-2",
        name: "Beta Club",
        role: "member",
        slug: "beta-club",
      },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain("community_members.role");
  });
});
