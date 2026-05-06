import { PostgresTribeCreationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-creation-repository";
import { TribeSlugConflictError } from "@/src/modules/tribes/domain/errors/tribe-slug-conflict-error";

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

describe("PostgresTribeCreationRepository", () => {
  it("creates the tribe and owner membership through an atomic SQL statement", async () => {
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
      repository.createTribeWithOwnerMembership({
        name: "Matematica Pro",
        ownerId: "member-1",
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
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "insert into public.tribe_post_categories"
    );
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("General");
    expect(sqlText).not.toContain("Anuncios");
    expect(sqlText).not.toContain("Preguntas");
    expect(sqlText).not.toContain("Eventos");
  });

  it("surfaces SQL errors without splitting the create flow across statements", async () => {
    const repository = new PostgresTribeCreationRepository(async () => {
      throw new Error("new row violates row-level security policy");
    });

    await expect(
      repository.createTribeWithOwnerMembership({
        name: "Matematica Pro",
        ownerId: "member-1",
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
      repository.createTribeWithOwnerMembership({
        name: "Matematica Pro",
        ownerId: "member-1",
        slug: "matematica-pro",
        visibility: "private",
      })
    ).rejects.toBeInstanceOf(TribeSlugConflictError);
  });

  it("checks whether a slug is already registered through the diagnostic function that bypasses tribes RLS", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ slug_taken: true }],
    }));

    const repository = new PostgresTribeCreationRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.isSlugTaken("matematica-pro")).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "select public.is_tribe_slug_taken("
    );
  });
});
