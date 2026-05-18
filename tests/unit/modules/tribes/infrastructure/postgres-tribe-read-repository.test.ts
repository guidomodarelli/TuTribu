import { PostgresTribeReadRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-read-repository";

function createFindBySlugDatabase(
  rows: Array<{
    id: string;
    name: string;
    slug: string;
    visibility: string;
  }>
) {
  const executeTakeFirst = jest.fn(async () => rows[0]);
  const limit = jest.fn(() => ({
    executeTakeFirst,
  }));
  const where = jest.fn(() => ({
    limit,
  }));
  const select = jest.fn(() => ({
    where,
  }));
  const selectFrom = jest.fn(() => ({
    select,
  }));

  return {
    database: {
      kysely: {
        selectFrom,
      },
    },
    executeTakeFirst,
    limit,
    select,
    selectFrom,
    where,
  };
}

function createVisibleMembershipTribesDatabase(
  rows: Array<{
    name: string | null;
    role: string | null;
    slug: string | null;
    tribe_id: string;
    tribe_row_id: string | null;
  }>
) {
  const execute = jest.fn(async () => rows);
  const orderBy = jest.fn(() => ({
    execute,
  }));
  const where = jest.fn(() => ({
    orderBy,
  }));
  const select = jest.fn(() => ({
    where,
  }));
  const leftJoin = jest.fn(() => ({
    select,
  }));
  const selectFrom = jest.fn(() => ({
    leftJoin,
  }));

  return {
    database: {
      kysely: {
        selectFrom,
      },
    },
    execute,
    leftJoin,
    orderBy,
    select,
    selectFrom,
    where,
  };
}

function createMembershipAccessDatabase(
  row: {
    status: string | null;
    status_reason: string | null;
  } | null
) {
  const executeTakeFirst = jest.fn(async () => row);
  const select = jest.fn(() => ({
    executeTakeFirst,
  }));
  const selectFrom = jest.fn(() => ({
    select,
  }));

  return {
    database: {
      kysely: {
        selectFrom,
      },
    },
    executeTakeFirst,
    select,
    selectFrom,
  };
}

describe("PostgresTribeReadRepository", () => {
  it("returns a visible tribe when the row is readable through RLS", async () => {
    const queryBuilder = createFindBySlugDatabase([
      {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    ]);

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
    );

    await expect(repository.findBySlug("matematica-pro")).resolves.toEqual({
      id: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });

    expect(queryBuilder.selectFrom).toHaveBeenCalledWith("tribes");
    expect(queryBuilder.select).toHaveBeenCalledWith([
      "id",
      "name",
      "slug",
      "visibility",
    ]);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      "slug",
      "=",
      "matematica-pro"
    );
    expect(queryBuilder.limit).toHaveBeenCalledWith(1);
    expect(queryBuilder.executeTakeFirst).toHaveBeenCalledTimes(1);
  });

  it("returns null when a readable tribe has an unsupported visibility value", async () => {
    const queryBuilder = createFindBySlugDatabase([
      {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "public",
      },
    ]);

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
    );

    await expect(repository.findBySlug("matematica-pro")).resolves.toBeNull();
  });

  it("returns the current membership access through the diagnostic function that preserves blocked-member detection", async () => {
    const queryBuilder = createMembershipAccessDatabase({
      status: "blocked",
      status_reason: "payment_blocked",
    });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
    );

    await expect(
      repository.findCurrentMembershipAccessBySlug("matematica-pro")
    ).resolves.toEqual({
      status: "blocked",
      statusReason: "payment_blocked",
    });

    expect(queryBuilder.selectFrom).toHaveBeenCalledWith(expect.anything());
    expect(queryBuilder.select).toHaveBeenCalledWith(["status", "status_reason"]);
    expect(queryBuilder.executeTakeFirst).toHaveBeenCalledTimes(1);
  });

  it("returns owner read access through the diagnostic function", async () => {
    const queryBuilder = createMembershipAccessDatabase({
      status: "owner_read",
      status_reason: "none",
    });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
    );

    await expect(
      repository.findCurrentMembershipAccessBySlug("matematica-pro")
    ).resolves.toEqual({
      status: "owner_read",
      statusReason: "none",
    });
  });

  it("returns the current membership access and readable tribe in one database query", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          status: "active",
          status_reason: "none",
          visibility: "private",
        },
      ],
    }));

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.findCurrentMembershipAccessWithTribeBySlug("matematica-pro")
    ).resolves.toEqual({
      membershipAccess: {
        status: "active",
        statusReason: "none",
      },
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps the membership access when the tribe row is not readable", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          id: null,
          name: null,
          slug: null,
          status: "active",
          status_reason: "none",
          visibility: null,
        },
      ],
    }));

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.findCurrentMembershipAccessWithTribeBySlug("matematica-pro")
    ).resolves.toEqual({
      membershipAccess: {
        status: "active",
        statusReason: "none",
      },
      tribe: null,
    });
  });

  it("lists visible membership tribes for the current member", async () => {
    const queryBuilder = createVisibleMembershipTribesDatabase([
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
    ]);

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
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

    expect(queryBuilder.selectFrom).toHaveBeenCalledWith("tribes");
    expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
      "tribe_members",
      expect.any(Function)
    );
    expect(queryBuilder.select).toHaveBeenCalledWith(expect.any(Function));
    expect(queryBuilder.where).toHaveBeenCalledWith(expect.any(Function));
    expect(queryBuilder.orderBy).toHaveBeenCalledWith("tribes.name", "asc");
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it("lists every readable tribe as read-only when the current viewer is the owner", async () => {
    const queryBuilder = createVisibleMembershipTribesDatabase([
      {
        tribe_id: "tribe-1",
        tribe_row_id: "tribe-1",
        name: "Alpha Club",
        role: "tribemate",
        slug: "alpha-club",
      },
      {
        tribe_id: "tribe-2",
        tribe_row_id: "tribe-2",
        name: "Beta Club",
        role: "tribemate",
        slug: "beta-club",
      },
    ]);

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
    );

    await expect(repository.listVisibleMembershipTribes()).resolves.toEqual([
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        role: "tribemate",
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-2",
        name: "Beta Club",
        role: "tribemate",
        slug: "beta-club",
      },
    ]);

    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it("lists visible members for a readable tribe", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          email: "ada.lovelace@example.com",
          image: null,
          member_id: "member-1",
          name: "Ada Lovelace",
          role: "leader",
        },
        {
          email: "grace.hopper@example.com",
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
        email: "ada.lovelace@example.com",
        id: "member-1",
        image: null,
        name: "Ada Lovelace",
        role: "leader",
      },
      {
        avatarFallback: "GH",
        email: "grace.hopper@example.com",
        id: "member-2",
        image: "https://example.com/grace.png",
        name: "Grace Hopper",
        role: "guardian",
      },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
