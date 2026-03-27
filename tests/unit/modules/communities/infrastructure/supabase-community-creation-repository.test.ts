import { SupabaseCommunityCreationRepository } from "@/src/modules/communities/infrastructure/repositories/supabase-community-creation-repository";
import { CommunitySlugConflictError } from "@/src/modules/communities/domain/errors/community-slug-conflict-error";

describe("SupabaseCommunityCreationRepository", () => {
  it("creates the community and owner membership through an atomic RPC", async () => {
    const rpc = jest.fn(async () => ({
      data: {
        id: "community-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
      error: null,
    }));
    const repository = new SupabaseCommunityCreationRepository(async () => ({
      from: jest.fn(() => {
        throw new Error("create should not use direct table inserts");
      }),
      rpc,
    }));

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

    expect(rpc).toHaveBeenCalledWith(
      "create_private_community_with_owner_membership",
      {
        target_name: "Matematica Pro",
        target_owner_id: "member-1",
        target_slug: "matematica-pro",
      }
    );
  });

  it("surfaces RPC errors without splitting the create flow across statements", async () => {
    const rpc = jest.fn(async () => ({
      data: null,
      error: {
        message: "new row violates row-level security policy",
      },
    }));

    const repository = new SupabaseCommunityCreationRepository(async () => ({
      from: jest.fn(() => {
        throw new Error("create should not use direct table inserts");
      }),
      rpc,
    }));

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
    const rpc = jest.fn(async () => ({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "communities_slug_key"',
      },
    }));

    const repository = new SupabaseCommunityCreationRepository(async () => ({
      from: jest.fn(() => {
        throw new Error("create should not use direct table reads");
      }),
      rpc,
    }));

    await expect(
      repository.createCommunityWithOwnerMembership({
        name: "Matematica Pro",
        ownerId: "member-1",
        slug: "matematica-pro",
        visibility: "private",
      })
    ).rejects.toBeInstanceOf(CommunitySlugConflictError);
  });

  it("checks whether a slug is already registered through the dedicated RPC", async () => {
    const rpc = jest.fn(async (fn: string) => ({
      data: fn === "is_community_slug_taken" ? true : null,
      error: null,
    }));

    const repository = new SupabaseCommunityCreationRepository(async () => ({
      from: jest.fn(() => {
        throw new Error("slug checks should not depend on table visibility");
      }),
      rpc,
    }));

    await expect(repository.isSlugTaken("matematica-pro")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("is_community_slug_taken", {
      target_slug: "matematica-pro",
    });
  });
});
