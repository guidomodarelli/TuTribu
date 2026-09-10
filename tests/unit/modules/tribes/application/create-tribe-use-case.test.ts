import { vi, describe, it, expect } from "vitest";
import { createTribe } from "@/src/modules/tribes/application/use-cases/create-tribe-use-case";
import { TribeSlugConflictError } from "@/src/modules/tribes/domain/errors/tribe-slug-conflict-error";

describe("createTribe", () => {
  it("creates a private tribe and its leader membership when the creator is whitelisted", async () => {
    const isEmailAllowed = vi.fn(async () => true);
    const isSlugTaken = vi.fn(async () => false);
    const createTribeWithLeaderMembership = vi.fn(async () => ({
      id: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private" as const,
    }));

    const execute = createTribe({
      tribeCreatorWhitelistRepository: {
        isEmailAllowed,
      },
      tribeCreationRepository: {
        isSlugTaken,
        createTribeWithLeaderMembership,
      },
    });

    await expect(
      execute({
        creatorEmail: "  LEADER@Example.com ",
        creatorId: "member-1",
        name: "  Matematica Pro  ",
        slug: "Matematica Pro",
      })
    ).resolves.toEqual({
      status: "created" as const,
      tribeId: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      leaderMemberRole: "leader",
    });

    expect(isEmailAllowed).toHaveBeenCalledWith("leader@example.com");
    expect(isSlugTaken).toHaveBeenCalledWith("matematica-pro");
    expect(createTribeWithLeaderMembership).toHaveBeenCalledWith({
      name: "Matematica Pro",
      leaderId: "member-1",
      slug: "matematica-pro",
      visibility: "private",
    });
  });

  it("rejects tribe creation when the creator email is not whitelisted", async () => {
    const isEmailAllowed = vi.fn(async () => false);
    const execute = createTribe({
      tribeCreatorWhitelistRepository: {
        isEmailAllowed,
      },
      tribeCreationRepository: {
        isSlugTaken: vi.fn(),
        createTribeWithLeaderMembership: vi.fn(),
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
      status: "not-allowed" as const,
    });
  });

  it("returns an invalid-slug result when the slug is empty after normalization", async () => {
    const execute = createTribe({
      tribeCreatorWhitelistRepository: {
        isEmailAllowed: vi.fn(async () => true),
      },
      tribeCreationRepository: {
        isSlugTaken: vi.fn(),
        createTribeWithLeaderMembership: vi.fn(),
      },
    });

    await expect(
      execute({
        creatorEmail: "leader@example.com",
        creatorId: "member-1",
        name: "Tribu valida",
        slug: "   ---   ",
      })
    ).resolves.toEqual({
      status: "invalid-slug" as const,
      message: "Define un slug valido para tu tribu.",
    });
  });

  it("suggests the next available slug when the requested slug is already taken", async () => {
    const isSlugTaken = vi
      .fn(async (slug: string) => ["matematica-pro", "matematica-pro-2"].includes(slug));
    const createTribeWithLeaderMembership = vi.fn();
    const execute = createTribe({
      tribeCreatorWhitelistRepository: {
        isEmailAllowed: vi.fn(async () => true),
      },
      tribeCreationRepository: {
        isSlugTaken,
        createTribeWithLeaderMembership,
      },
    });

    await expect(
      execute({
        creatorEmail: "leader@example.com",
        creatorId: "member-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "slug-conflict" as const,
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-3",
    });

    expect(createTribeWithLeaderMembership).not.toHaveBeenCalled();
  });

  it("treats reserved slugs as unavailable and suggests an alternative", async () => {
    const execute = createTribe({
      tribeCreatorWhitelistRepository: {
        isEmailAllowed: vi.fn(async () => true),
      },
      tribeCreationRepository: {
        isSlugTaken: vi.fn(async () => false),
        createTribeWithLeaderMembership: vi.fn(),
      },
    });

    await expect(
      execute({
        creatorEmail: "leader@example.com",
        creatorId: "member-1",
        name: "Robots",
        slug: "robots",
      })
    ).resolves.toEqual({
      status: "slug-conflict" as const,
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "robots-2",
    });
  });

  it("returns a recoverable slug conflict when persistence detects a duplicate slug", async () => {
    const isSlugTaken = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const execute = createTribe({
      tribeCreatorWhitelistRepository: {
        isEmailAllowed: vi.fn(async () => true),
      },
      tribeCreationRepository: {
        isSlugTaken,
        createTribeWithLeaderMembership: vi.fn(async () => {
          throw new TribeSlugConflictError();
        }),
      },
    });

    await expect(
      execute({
        creatorEmail: "leader@example.com",
        creatorId: "member-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "slug-conflict" as const,
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-2",
    });
  });

  it("keeps duplicate submissions deterministic when persistence raises the same slug conflict twice", async () => {
    const isSlugTaken = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const createTribeWithLeaderMembership = vi
      .fn()
      .mockRejectedValueOnce(new TribeSlugConflictError())
      .mockRejectedValueOnce(new TribeSlugConflictError());
    const execute = createTribe({
      tribeCreatorWhitelistRepository: {
        isEmailAllowed: vi.fn(async () => true),
      },
      tribeCreationRepository: {
        isSlugTaken,
        createTribeWithLeaderMembership,
      },
    });

    const command = {
      creatorEmail: "leader@example.com",
      creatorId: "member-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
    };

    await expect(execute(command)).resolves.toEqual({
      status: "slug-conflict" as const,
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-2",
    });

    await expect(execute(command)).resolves.toEqual({
      status: "slug-conflict" as const,
      message: "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
      suggestedSlug: "matematica-pro-2",
    });
  });
});
