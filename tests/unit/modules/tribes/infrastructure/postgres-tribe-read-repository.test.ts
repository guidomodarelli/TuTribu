import { PostgresTribeReadRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-read-repository";
import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";

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
  }>
) {
  const execute = jest.fn(async () => rows);
  const orderBy = jest.fn(() => ({
    execute,
  }));
  const select = jest.fn(() => ({
    orderBy,
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
    execute,
    orderBy,
    select,
    selectFrom,
  };
}

function createRequestKyselyVisibleMembershipTribesDatabase(
  rows: Array<{
    name: string | null;
    role: string | null;
    slug: string | null;
    tribe_id: string;
  }>
) {
  const query = jest.fn(async () => ({
    rowCount: rows.length,
    rows,
  }));

  return {
    database: {
      kysely: createKyselyRequestDatabase({
        query,
      } as never),
    },
    query,
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

function createMembershipAccessWithTribeDatabase(
  row: {
    id: string | null;
    name: string | null;
    slug: string | null;
    status: string | null;
    status_reason: string | null;
    visibility: string | null;
  } | null
) {
  const executeTakeFirst = jest.fn(async () => row);
  const limit = jest.fn(() => ({
    executeTakeFirst,
  }));
  const select = jest.fn(() => ({
    limit,
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
    executeTakeFirst,
    leftJoin,
    limit,
    select,
    selectFrom,
  };
}

function createVisibleTribeMembersDatabase(
  rows: Array<{
    email: string;
    image: string | null;
    member_id: string;
    name: string | null;
    role: string | null;
  }>
) {
  const execute = jest.fn(async () => rows);
  const select = jest.fn(() => ({
    execute,
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
    execute,
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
    const queryBuilder = createMembershipAccessWithTribeDatabase({
      id: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      status: "active",
      status_reason: "none",
      visibility: "private",
    });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
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

    expect(queryBuilder.selectFrom).toHaveBeenCalledWith(expect.anything());
    expect(queryBuilder.leftJoin).toHaveBeenCalledWith("tribes", expect.any(Function));
    expect(queryBuilder.select).toHaveBeenCalledWith([
      "membership_access.status",
      "membership_access.status_reason",
      "tribes.id",
      "tribes.name",
      "tribes.slug",
      "tribes.visibility",
    ]);
    expect(queryBuilder.limit).toHaveBeenCalledWith(1);
    expect(queryBuilder.executeTakeFirst).toHaveBeenCalledTimes(1);
  });

  it("keeps the membership access when the tribe row is not readable", async () => {
    const queryBuilder = createMembershipAccessWithTribeDatabase({
      id: null,
      name: null,
      slug: null,
      status: "active",
      status_reason: "none",
      visibility: null,
    });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
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
        name: "Alpha Club",
        role: "leader",
        slug: "alpha-club",
      },
      {
        tribe_id: "tribe-2",
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

    expect(queryBuilder.selectFrom).toHaveBeenCalledWith(expect.anything());
    expect(queryBuilder.select).toHaveBeenCalledWith([
      "tribe_id",
      "name",
      "role",
      "slug",
    ]);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith("name", "asc");
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it("lists every readable owner-only tribe as read-only", async () => {
    const databaseDouble = createRequestKyselyVisibleMembershipTribesDatabase([
      {
        tribe_id: "tribe-1",
        name: "Alpha Club",
        role: "tribemate",
        slug: "alpha-club",
      },
      {
        tribe_id: "tribe-2",
        name: "Beta Club",
        role: "tribemate",
        slug: "beta-club",
      },
    ]);

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(databaseDouble.database as never)
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

    expect(databaseDouble.query).toHaveBeenCalledTimes(1);
    expect(databaseDouble.query.mock.calls[0]?.[0]).toMatch(
      /public\.list_visible_membership_tribes/i
    );
  });

  it("preserves the real active membership role when the current owner is also a tribe leader", async () => {
    const databaseDouble = createRequestKyselyVisibleMembershipTribesDatabase([
      {
        tribe_id: "tribe-1",
        name: "Alpha Club",
        role: "leader",
        slug: "alpha-club",
      },
    ]);

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(repository.listVisibleMembershipTribes()).resolves.toEqual([
      {
        tribeId: "tribe-1",
        name: "Alpha Club",
        role: "leader",
        slug: "alpha-club",
      },
    ]);

    const sqlText = databaseDouble.query.mock.calls[0]?.[0];

    expect(sqlText).toMatch(/public\.list_visible_membership_tribes/i);
    expect(sqlText).not.toMatch(/left\s+join\s+"tribe_members"/i);
  });

  it("lists visible members for a readable tribe", async () => {
    const queryBuilder = createVisibleTribeMembersDatabase([
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
    ]);

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback(queryBuilder.database as never)
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

    expect(queryBuilder.selectFrom).toHaveBeenCalledWith(expect.anything());
    expect(queryBuilder.select).toHaveBeenCalledWith([
      "member_id",
      "role",
      "name",
      "email",
      "image",
    ]);
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
  });
});
