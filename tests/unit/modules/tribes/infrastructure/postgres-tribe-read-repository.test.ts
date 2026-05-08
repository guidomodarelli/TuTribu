import { PostgresTribeReadRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-read-repository";

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

describe("PostgresTribeReadRepository", () => {
  it("returns a visible tribe when the row is readable through RLS", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private",
        },
      ],
    }));

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.findBySlug("matematica-pro")).resolves.toEqual({
      id: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });
  });

  it("returns the current membership access through the diagnostic function that preserves blocked-member detection", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "blocked", status_reason: "payment_blocked" }],
    }));

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.findCurrentMembershipAccessBySlug("matematica-pro")
    ).resolves.toEqual({
      status: "blocked",
      statusReason: "payment_blocked",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "from public.get_current_tribe_membership_by_slug("
    );
  });

  it("lists visible membership tribes for the current member", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          tribe_id: "tribe-1",
          tribe_row_id: "tribe-1",
          name: "Alpha Club",
          role: "leader",
          slug: "alpha-club",
        },
        {
          tribe_id: "tribe-2",
          tribe_row_id: "tribe-2",
          name: "Beta Club",
          role: "tribemate",
          slug: "beta-club",
        },
      ],
    }));

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.listVisibleMembershipTribes()).resolves.toEqual([
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        role: "leader",
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-2",
        name: "Beta Club",
        role: "tribemate",
        slug: "beta-club",
      },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain("tribe_members.role");
  });

  it("limits visible membership tribes to the current member", async () => {
    const execute = jest.fn(async () => ({
      rows: [],
    }));

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await repository.listVisibleMembershipTribes();

    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "tribe_members.user_id = public.current_app_user_id()"
    );
  });

  it("lists visible members for a readable tribe", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          image: null,
          member_id: "member-1",
          name: "Ada Lovelace",
          role: "leader",
        },
        {
          image: "https://example.com/grace.png",
          member_id: "member-2",
          name: "Grace Hopper",
          role: "guardian",
        },
      ],
    }));

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.listVisibleTribeMembersBySlug("matematica-pro")
    ).resolves.toEqual([
      {
        avatarFallback: "AL",
        id: "member-1",
        image: null,
        name: "Ada Lovelace",
        role: "leader",
      },
      {
        avatarFallback: "GH",
        id: "member-2",
        image: "https://example.com/grace.png",
        name: "Grace Hopper",
        role: "guardian",
      },
    ]);

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain(
      "from public.list_visible_tribe_members_by_slug("
    );
    expect(sqlText).not.toContain("inner join public.tribe_members");
  });
});
