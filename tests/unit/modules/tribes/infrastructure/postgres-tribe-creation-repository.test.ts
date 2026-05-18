import { PostgresTribeCreationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-creation-repository";
import { TribeSlugConflictError } from "@/src/modules/tribes/domain/errors/tribe-slug-conflict-error";

function createSlugDiagnosticDatabase(rows: Array<{ slugTaken: boolean }>) {
  const executeTakeFirst = jest.fn(async () => rows[0]);
  const selectNoFrom = jest.fn(() => ({
    executeTakeFirst,
  }));

  return {
    database: {
      kysely: {
        selectNoFrom,
      },
    },
    executeTakeFirst,
    selectNoFrom,
  };
}

describe("PostgresTribeCreationRepository", () => {
  it("creates the tribe and leader membership through one database operation", async () => {
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
    const repository = new PostgresTribeCreationRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.createTribeWithLeaderMembership({
        name: "Matematica Pro",
        leaderId: "member-1",
        slug: "matematica-pro",
        visibility: "private",
      })
    ).resolves.toEqual({
      id: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("surfaces SQL errors without splitting the create flow across statements", async () => {
    const repository = new PostgresTribeCreationRepository(async () => {
      throw new Error("new row violates row-level security policy");
    });

    await expect(
      repository.createTribeWithLeaderMembership({
        name: "Matematica Pro",
        leaderId: "member-1",
        slug: "matematica-pro",
        visibility: "private",
      })
    ).rejects.toThrow("new row violates row-level security policy");
  });

  it("maps duplicate slug failures to a domain conflict error", async () => {
    const repository = new PostgresTribeCreationRepository(async () => {
      throw {
        code: "23505",
        message: 'duplicate key value violates unique constraint "tribes_slug_key"',
      };
    });

    await expect(
      repository.createTribeWithLeaderMembership({
        name: "Matematica Pro",
        leaderId: "member-1",
        slug: "matematica-pro",
        visibility: "private",
      })
    ).rejects.toBeInstanceOf(TribeSlugConflictError);
  });

  it("checks whether a slug is already registered through the diagnostic function that bypasses tribes RLS", async () => {
    const queryBuilder = createSlugDiagnosticDatabase([{ slugTaken: true }]);

    const repository = new PostgresTribeCreationRepository(async (callback) =>
      callback(queryBuilder.database as never)
    );

    await expect(repository.isSlugTaken("matematica-pro")).resolves.toBe(true);
    expect(queryBuilder.selectNoFrom).toHaveBeenCalledWith(expect.any(Function));
    expect(queryBuilder.executeTakeFirst).toHaveBeenCalledTimes(1);
  });
});
