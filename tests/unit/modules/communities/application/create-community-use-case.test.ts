import { createCommunity } from "@/src/modules/communities/application/use-cases/create-community-use-case";
import { CommunitySlugConflictError } from "@/src/modules/communities/domain/errors/community-slug-conflict-error";

describe("createCommunity", () => {
  it("creates a private community and its owner membership when the creator is whitelisted", async () => {
    const isEmailAllowed = jest.fn(async () => true);
    const isSlugTaken = jest.fn(async () => false);
    const createCommunityWithOwnerMembership = jest.fn(async () => ({
      id: "community-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private" as const,
    }));

    const execute = createCommunity({
      communityCreatorWhitelistRepository: {
        isEmailAllowed,
      },
      communityCreationRepository: {
        isSlugTaken,
        createCommunityWithOwnerMembership,
      },
    });

    await expect(
      execute({
        creatorEmail: "  OWNER@Example.com ",
        creatorId: "member-1",
        name: "  Matematica Pro  ",
        slug: "Matematica Pro",
      })
    ).resolves.toEqual({
      status: "created",
      communityId: "community-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      ownerMemberRole: "owner",
    });

    expect(isEmailAllowed).toHaveBeenCalledWith("owner@example.com");
    expect(isSlugTaken).toHaveBeenCalledWith("matematica-pro");
    expect(createCommunityWithOwnerMembership).toHaveBeenCalledWith({
      name: "Matematica Pro",
      ownerId: "member-1",
      slug: "matematica-pro",
      visibility: "private",
    });
  });

  it("rejects community creation when the creator email is not whitelisted", async () => {
    const isEmailAllowed = jest.fn(async () => false);
    const execute = createCommunity({
      communityCreatorWhitelistRepository: {
        isEmailAllowed,
      },
      communityCreationRepository: {
        isSlugTaken: jest.fn(),
        createCommunityWithOwnerMembership: jest.fn(),
      },
    });

    await expect(
      execute({
        creatorEmail: "outsider@example.com",
        creatorId: "member-2",
        name: "Tribu cerrada",
        slug: "tribu-cerrada",
      })
    ).resolves.toEqual({
      status: "not-allowed",
    });
  });

  it("returns an invalid-slug result when the slug is empty after normalization", async () => {
    const execute = createCommunity({
      communityCreatorWhitelistRepository: {
        isEmailAllowed: jest.fn(async () => true),
      },
      communityCreationRepository: {
        isSlugTaken: jest.fn(),
        createCommunityWithOwnerMembership: jest.fn(),
      },
    });

    await expect(
      execute({
        creatorEmail: "owner@example.com",
        creatorId: "member-1",
        name: "Tribu valida",
        slug: "   ---   ",
      })
    ).resolves.toEqual({
      status: "invalid-slug",
      message: "Define un slug valido para tu tribu.",
    });
  });

  it("suggests the next available slug when the requested slug is already taken", async () => {
    const isSlugTaken = jest
      .fn(async (slug: string) => ["matematica-pro", "matematica-pro-2"].includes(slug));
    const createCommunityWithOwnerMembership = jest.fn();
    const execute = createCommunity({
      communityCreatorWhitelistRepository: {
        isEmailAllowed: jest.fn(async () => true),
      },
      communityCreationRepository: {
        isSlugTaken,
        createCommunityWithOwnerMembership,
      },
    });

    await expect(
      execute({
        creatorEmail: "owner@example.com",
        creatorId: "member-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "slug-conflict",
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-3",
    });

    expect(createCommunityWithOwnerMembership).not.toHaveBeenCalled();
  });

  it("treats reserved slugs as unavailable and suggests an alternative", async () => {
    const execute = createCommunity({
      communityCreatorWhitelistRepository: {
        isEmailAllowed: jest.fn(async () => true),
      },
      communityCreationRepository: {
        isSlugTaken: jest.fn(async () => false),
        createCommunityWithOwnerMembership: jest.fn(),
      },
    });

    await expect(
      execute({
        creatorEmail: "owner@example.com",
        creatorId: "member-1",
        name: "Crear",
        slug: "crear",
      })
    ).resolves.toEqual({
      status: "slug-conflict",
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "crear-2",
    });
  });

  it("returns a recoverable slug conflict when persistence detects a duplicate slug", async () => {
    const isSlugTaken = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const execute = createCommunity({
      communityCreatorWhitelistRepository: {
        isEmailAllowed: jest.fn(async () => true),
      },
      communityCreationRepository: {
        isSlugTaken,
        createCommunityWithOwnerMembership: jest.fn(async () => {
          throw new CommunitySlugConflictError();
        }),
      },
    });

    await expect(
      execute({
        creatorEmail: "owner@example.com",
        creatorId: "member-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "slug-conflict",
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-2",
    });
  });

  it("keeps duplicate submissions deterministic when persistence raises the same slug conflict twice", async () => {
    const isSlugTaken = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const createCommunityWithOwnerMembership = jest
      .fn()
      .mockRejectedValueOnce(new CommunitySlugConflictError())
      .mockRejectedValueOnce(new CommunitySlugConflictError());
    const execute = createCommunity({
      communityCreatorWhitelistRepository: {
        isEmailAllowed: jest.fn(async () => true),
      },
      communityCreationRepository: {
        isSlugTaken,
        createCommunityWithOwnerMembership,
      },
    });

    const command = {
      creatorEmail: "owner@example.com",
      creatorId: "member-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
    };

    await expect(execute(command)).resolves.toEqual({
      status: "slug-conflict",
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-2",
    });

    await expect(execute(command)).resolves.toEqual({
      status: "slug-conflict",
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-2",
    });
  });
});
