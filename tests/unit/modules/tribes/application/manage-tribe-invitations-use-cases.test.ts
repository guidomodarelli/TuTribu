import {
  acceptTribeInvitation,
  createTribeInvitation,
  getTribeInvitationSubscriptionOffer,
  listTribeInvitations,
  listTribeInvitationsByPrice,
  revokeTribeInvitation,
  updateTribeInvitationReferralMetadata,
  updateTribeInvitationSubscriptionAssociation,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-invitations-use-cases";
import {
  TRIBE_INVITATION_STATUS,
  TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE,
} from "@/src/modules/tribes/constants/tribe-invitations";
import type { TribeInvitationRepository } from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";

const SAMPLE_INVITATION = {
  campaignName: null,
  channel: null,
  createdAt: "2026-04-26T07:00:00.000Z",
  createdByName: "Grace Hopper",
  id: "invitation-1",
  invitationUrl:
    "https://tutribu.example.com/matematica-pro/invitar/token",
  referrerHandle: null,
  subscriptionAssociation: {
    type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current,
  },
} as const;

function buildRepository(
  overrides: Partial<TribeInvitationRepository> = {}
): TribeInvitationRepository {
  return {
    accept: jest.fn(async () => ({ status: TRIBE_INVITATION_STATUS.accepted })),
    create: jest.fn(async () => ({
      invitation: SAMPLE_INVITATION,
      invitationUrl: SAMPLE_INVITATION.invitationUrl,
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
    getConversionMetrics: jest.fn(async () => []),
    listByPriceId: jest.fn(async () => ({ invitations: [] })),
    listByTribeSlug: jest.fn(async () => []),
    revoke: jest.fn(async () => ({ status: TRIBE_INVITATION_STATUS.revoked })),
    updateSubscriptionAssociation: jest.fn(async () => ({
      invitation: SAMPLE_INVITATION,
      status: TRIBE_INVITATION_STATUS.updated,
    })),
    updateReferralMetadata: jest.fn(async () => ({
      invitation: SAMPLE_INVITATION,
      status: TRIBE_INVITATION_STATUS.updated,
    })),
    ...overrides,
  };
}

describe("manage tribe invitations use cases", () => {
  it("creates invitations with the explicit current-plan association", async () => {
    const repository = buildRepository();
    const useCase = createTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        subscriptionAssociation: {
          type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current,
        },
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toMatchObject({
      status: TRIBE_INVITATION_STATUS.created,
    });

    expect(repository.create).toHaveBeenCalledWith({
      baseUrl: "https://tutribu.example.com",
      invitationId: expect.any(String),
      referralMetadata: {
        campaignName: null,
        channel: null,
        referrerHandle: null,
      },
      subscriptionAssociation: {
        type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current,
      },
      token: expect.any(String),
      tribeSlug: "matematica-pro",
    });
    expect((repository.create as jest.Mock).mock.calls[0]?.[0].invitationId).not.toBe(
      (repository.create as jest.Mock).mock.calls[0]?.[0].token
    );
  });

  it("creates invitations for an explicit specific plan id", async () => {
    const repository = buildRepository();
    const useCase = createTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await useCase({
      baseUrl: "https://tutribu.example.com",
      subscriptionAssociation: {
        priceId: "11111111-1111-4111-8111-111111111111",
        type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific,
      },
      tribeSlug: "matematica-pro",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionAssociation: {
          priceId: "11111111-1111-4111-8111-111111111111",
          type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific,
        },
      })
    );
  });

  it("normalizes referral metadata when creating invitations", async () => {
    const repository = buildRepository();
    const useCase = createTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await useCase({
      baseUrl: "https://tutribu.example.com",
      campaignName: " lanzamiento mayo ",
      channel: "Instagram",
      referrerHandle: " @partner_ig ",
      subscriptionAssociation: {
        type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current,
      },
      tribeSlug: "matematica-pro",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referralMetadata: {
          campaignName: "lanzamiento mayo",
          channel: "instagram",
          referrerHandle: "@partner_ig",
        },
      })
    );
  });

  it("rejects invalid referral metadata when creating invitations", async () => {
    const repository = buildRepository();
    const useCase = createTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        channel: "newsletter",
        subscriptionAssociation: {
          type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current,
        },
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.invalid });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects malformed referral metadata field types when creating invitations", async () => {
    const repository = buildRepository();
    const useCase = createTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        channel: 123,
        subscriptionAssociation: {
          type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current,
        },
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.invalid });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects invitation creation when association is missing or invalid", async () => {
    const repository = buildRepository();
    const useCase = createTribeInvitation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        subscriptionAssociation: undefined,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.invalid });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        subscriptionAssociation: {
          type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific,
        },
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.invalid });

    expect(repository.create).not.toHaveBeenCalled();
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
        subscriptionAssociation: {
          type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free,
        },
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.forbidden });
  });

  it("updates the subscription association for an existing invitation", async () => {
    const repository = buildRepository();
    const useCase = updateTribeInvitationSubscriptionAssociation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        invitationId: " invitation-1 ",
        subscriptionAssociation: {
          type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free,
        },
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toMatchObject({ status: TRIBE_INVITATION_STATUS.updated });

    expect(repository.updateSubscriptionAssociation).toHaveBeenCalledWith({
      baseUrl: "https://tutribu.example.com",
      invitationId: "invitation-1",
      subscriptionAssociation: {
        type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free,
      },
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects subscription association updates with invalid payloads", async () => {
    const repository = buildRepository();
    const useCase = updateTribeInvitationSubscriptionAssociation({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        invitationId: "invitation-1",
        subscriptionAssociation: { type: "unknown" },
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.invalid });
  });

  it("rejects malformed referral metadata field types when updating invitations", async () => {
    const repository = buildRepository();
    const useCase = updateTribeInvitationReferralMetadata({
      tribeInvitationRepository: repository,
    });

    await expect(
      useCase({
        baseUrl: "https://tutribu.example.com",
        campaignName: ["lanzamiento mayo"],
        invitationId: "invitation-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_INVITATION_STATUS.invalid });

    expect(repository.updateReferralMetadata).not.toHaveBeenCalled();
  });

  it("lists active invitations forwarding the public base URL for the tribe slug", async () => {
    const repository = buildRepository();
    const useCase = listTribeInvitations({
      tribeInvitationRepository: repository,
    });

    await useCase({
      baseUrl: "https://tutribu.example.com",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.listByTribeSlug).toHaveBeenCalledWith({
      baseUrl: "https://tutribu.example.com",
      tribeSlug: "matematica-pro",
    });
  });

  it("lists invitations linked to a specific price", async () => {
    const repository = buildRepository();
    const useCase = listTribeInvitationsByPrice({
      tribeInvitationRepository: repository,
    });

    await useCase({
      baseUrl: "https://tutribu.example.com",
      priceId: " price-1 ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.listByPriceId).toHaveBeenCalledWith({
      baseUrl: "https://tutribu.example.com",
      priceId: "price-1",
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
