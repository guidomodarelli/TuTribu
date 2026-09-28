import { vi, describe, it, expect } from "vitest";
import { PostgresTribeCreationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-creation-repository";
import { TribeSlugConflictError } from "@/src/modules/tribes/domain/errors/tribe-slug-conflict-error";


describe("PostgresTribeCreationRepository", () => {
  it("creates the tribe and leader membership through an atomic SQL statement", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private",
        },
      ],
    }); });
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
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ slug_taken: true }],
    }); });

    const repository = new PostgresTribeCreationRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.isSlugTaken("matematica-pro")).resolves.toBe(true);
  });
});
