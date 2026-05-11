import {
  acceptTribeInvitation,
  createTribeInvitation,
  getTribeInvitationSubscriptionOffer,
  listTribeInvitations,
  revokeTribeInvitation,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-invitations-use-cases";
import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import type { TribeInvitationRepository } from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";

function buildRepository(
  overrides: Partial<TribeInvitationRepository> = {}
): TribeInvitationRepository {
  return {
    accept: jest.fn(async () => ({ status: TRIBE_INVITATION_STATUS.accepted })),
    create: jest.fn(async () => ({
      invitation: {
        createdAt: "2026-04-26T07:00:00.000Z",
        createdByName: "Grace Hopper",
        id: "invitation-1",
        invitationUrl: "https://tutribu.example.com/tribu/matematica-pro/invitar/token",
      },
      invitationUrl: "https://tutribu.example.com/tribu/matematica-pro/invitar/token",
      status: TRIBE_INVITATION_STATUS.created,
    })),
    getSubscriptionOffer: jest.fn(async () => ({
      price: {
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available",
    })),
    listByTribeSlug: jest.fn(async () => []),
    revoke: jest.fn(async () => ({ status: TRIBE_INVITATION_STATUS.revoked })),
    ...overrides,
  };
}

describe("manage tribe invitations use cases", () => {
  it("creates invitations with a private token distinct from the invitation id", async () => {
    const repository = buildRepository();
    const useCase = createTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toMatchObject({
      status: TRIBE_INVITATION_STATUS.created,
    });

    expect(repository.create).toHaveBeenCalledWith({
      baseUrl: "https://tutribu.example.com",
      invitationId: expect.any(String),
      token: expect.any(String),
      tribeSlug: "matematica-pro",
    });
    expect((repository.create as jest.Mock).mock.calls[0]?.[0].invitationId).not.toBe(
      (repository.create as jest.Mock).mock.calls[0]?.[0].token
    );
  });

  it("passes forbidden creation results from the repository", async () => {
    const repository = buildRepository({
      create: jest.fn(async () => ({ status: TRIBE_INVITATION_STATUS.forbidden })),
    });
    const useCase = createTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.forbidden });
  });

  it("lists active invitations for a tribe slug", async () => {
    const repository = buildRepository();
    const useCase = listTribeInvitations({
      tribeInvitationRepository: repository,
    });

    await useCase({
      tribeSlug: " matematica-pro ",
    });

    expect(repository.listByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("revokes invitations by slug and invitation id", async () => {
    const repository = buildRepository();
    const useCase = revokeTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        invitationId: " invitation-1 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.revoked });
  });

  it("does not convert blocked invitation acceptance into membership", async () => {
    const repository = buildRepository({
      accept: jest.fn(async () => ({ status: TRIBE_INVITATION_STATUS.blocked })),
    });
    const useCase = acceptTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        token: " token ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.blocked });
  });

  it("keeps acceptance idempotent by delegating existing membership handling to the repository", async () => {
    const repository = buildRepository({
      accept: jest.fn(async () => ({ status: TRIBE_INVITATION_STATUS.accepted })),
    });
    const useCase = acceptTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        token: "existing-member-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.accepted });
  });

  it("gets the current invitation subscription offer with normalized inputs", async () => {
    const repository = buildRepository();
    const useCase = getTribeInvitationSubscriptionOffer({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        token: " invitation-token ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toMatchObject({
      price: {
        name: "Plan mensual",
      },
      status: "available",
    });

    expect(repository.getSubscriptionOffer).toHaveBeenCalledWith({
      token: "invitation-token",
      tribeSlug: "matematica-pro",
    });
  });
});
