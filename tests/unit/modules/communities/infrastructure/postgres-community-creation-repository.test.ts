import { PostgresCommunityCreationRepository } from "@/src/modules/communities/infrastructure/repositories/postgres-community-creation-repository";
import { CommunitySlugConflictError } from "@/src/modules/communities/domain/errors/community-slug-conflict-error";

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

describe("PostgresCommunityCreationRepository", () => {
  it("creates the community and owner membership through an atomic SQL statement", async () => {
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
    const repository = new PostgresCommunityCreationRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.createCommunityWithOwnerMembership({
        name: "Matematica Pro",
        ownerId: "member-1",
        slug: "matematica-pro",
        visibility: "private",
      })
    ).resolves.toEqual({
      id: "community-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("surfaces SQL errors without splitting the create flow across statements", async () => {
    const repository = new PostgresCommunityCreationRepository(async () => {
      throw new Error("new row violates row-level security policy");
    });

    await expect(
      repository.createCommunityWithOwnerMembership({
        name: "Matematica Pro",
        ownerId: "member-1",
        slug: "matematica-pro",
        visibility: "private",
      })
    ).rejects.toThrow("new row violates row-level security policy");
  });

  it("maps duplicate slug failures to a domain conflict error", async () => {
    const repository = new PostgresCommunityCreationRepository(async () => {
      throw {
        code: "23505",
        message: 'duplicate key value violates unique constraint "communities_slug_key"',
      };
    });

    await expect(
      repository.createCommunityWithOwnerMembership({
        name: "Matematica Pro",
        ownerId: "member-1",
        slug: "matematica-pro",
        visibility: "private",
      })
    ).rejects.toBeInstanceOf(CommunitySlugConflictError);
  });

  it("checks whether a slug is already registered through the diagnostic function that bypasses communities RLS", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ slug_taken: true }],
    }));

    const repository = new PostgresCommunityCreationRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.isSlugTaken("matematica-pro")).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "select public.is_community_slug_taken("
    );
  });
});
