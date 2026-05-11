import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribePage from "@/app/(platform)/tribu/[slug]/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const listTribeRound = jest.fn();
const confirmTribeMemberSubscriptionReturn = jest.fn();
const reconcileCurrentTribeMemberSubscription = jest.fn();
const validatePendingTribeMemberSubscriptionReturn = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

const tribeChannel = {
  accessScope: "tribemates" as const,
  emoji: "🔥",
  id: "channel-ronda",
  name: "Ronda",
  slug: "ronda",
  sortOrder: 20,
};

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

describe("TribePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (notFound as unknown as jest.Mock).mockReset();
    (createRequestModules as jest.Mock).mockReset();
    getAuthenticatedMember.mockReset();
    getTribePageAccess.mockReset();
    listTribeRound.mockReset();
    confirmTribeMemberSubscriptionReturn.mockReset();
    reconcileCurrentTribeMemberSubscription.mockReset();
    validatePendingTribeMemberSubscriptionReturn.mockReset();
    infoMock.mockReset();
    errorMock.mockReset();

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getTribePageAccess,
        },
      },
      messages: {
        useCases: {
          listTribeRound,
        },
      },
      subscriptions: {
        useCases: {
          confirmTribeMemberSubscriptionReturn: undefined,
          reconcileCurrentTribeMemberSubscription: undefined,
          validatePendingTribeMemberSubscriptionReturn,
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      info: infoMock,
      error: errorMock,
    });
  });

  it("renders the tribe operational home when access is visible", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    listTribeRound.mockResolvedValue({
      activeChannelId: null,
      channels: [tribeChannel],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
      },
      messages: [
        {
          id: "message-1",
          author: {
            id: "leader-1",
            name: "Ada Lovelace",
            role: "leader",
            avatarFallback: "AL",
            image: null,
          },
          channel: tribeChannel,
          replies: [
            {
              id: "reply-1",
              author: {
                id: "guardian-1",
                name: "Grace Hopper",
                role: "guardian",
                avatarFallback: "GH",
                image: null,
              },
              content: "Gracias por la bienvenida",
              createdAt: "2026-04-26T12:05:00.000Z",
            },
          ],
          content: "Bienvenida a la tribu",
          createdAt: "2026-04-26T12:00:00.000Z",
          likedByViewer: false,
          likeCount: 2,
          title: "Anuncio inicial",
        },
        {
          id: "message-2",
          author: {
            id: "member-2",
            name: "Katherine Johnson",
            role: "tribemate",
            avatarFallback: "KJ",
            image: null,
          },
          channel: tribeChannel,
          replies: [],
          content: "Comparto un recurso nuevo",
          createdAt: "2026-04-26T11:00:00.000Z",
          likedByViewer: true,
          likeCount: 1,
          title: "Nuevo recurso",
        },
      ],
    });

    render(
      await TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(screen.queryByText("Inicio de tribu")).not.toBeInTheDocument();
    expect(screen.queryByText("Matematica Pro")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Compartí novedades, preguntas y recursos con los miembros.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Tribu privada")).not.toBeInTheDocument();
    expect(screen.queryByText("/tribu/matematica-pro")).not.toBeInTheDocument();
    expect(screen.queryByText("Mensajees")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Compartí algo en la ronda",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", {
        name: "Escribir una respuesta",
      })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Bienvenida a la tribu")).toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();
    expect(screen.queryByText("Gracias por la bienvenida")).not.toBeInTheDocument();
    expect(screen.getByText("Líder")).toBeInTheDocument();
    expect(screen.queryByText("Guardián")).not.toBeInTheDocument();
    expect(screen.queryByText("Integrante")).not.toBeInTheDocument();
    expect(screen.queryByText("Estado de la tribu")).not.toBeInTheDocument();
  });

  it("keeps local visible access when subscription reconciliation cannot reach the provider", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    reconcileCurrentTribeMemberSubscription.mockResolvedValue({
      status: "provider_unavailable",
    });
    listTribeRound.mockResolvedValue({
      activeChannelId: null,
      channels: [tribeChannel],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
      },
      messages: [],
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    (createRequestModules as jest.Mock)
      .mockResolvedValueOnce({
        auth: {
          useCases: {
            getAuthenticatedMember,
          },
        },
        tribes: {
          useCases: {
            getTribePageAccess,
          },
        },
        messages: {
          useCases: {
            listTribeRound,
          },
        },
        subscriptions: {
          useCases: {
            validatePendingTribeMemberSubscriptionReturn,
          },
        },
      })
      .mockResolvedValueOnce({
        subscriptions: {
          useCases: {
            reconcileCurrentTribeMemberSubscription,
          },
        },
      });

    render(
      await TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(reconcileCurrentTribeMemberSubscription).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
    expect(getTribePageAccess).toHaveBeenCalledWith({
      isAuthenticated: true,
      slug: "matematica-pro",
    });
    expect(notFound).not.toHaveBeenCalled();
    expect(listTribeRound).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("renders a read-only empty round for muted members", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "muted@example.com",
      name: "Muted User",
      role: "tribemate",
      avatarFallback: "MU",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    listTribeRound.mockResolvedValue({
      activeChannelId: null,
      channels: [tribeChannel],
      viewerPermissions: {
        canReply: false,
        canCreateMessage: false,
        canReact: false,
      },
      messages: [],
    });

    render(
      await TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(
      screen.queryByRole("button", {
        name: "Compartí algo en la ronda",
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Podes leer la ronda, pero tu estado actual no permite participar.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Compartí el primer mensaje de la ronda")
    ).toBeInTheDocument();
  });

  it("returns 404 and logs unauthenticated hidden access", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      reason: "unauthenticated_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(infoMock).toHaveBeenCalledWith({
      message: "Tribe access hidden",
      metadata: expect.objectContaining({
        reason: "unauthenticated_hidden",
        slug: "matematica-pro",
        viewerId: null,
      }),
    });
  });

  it("returns 404 and logs blocked hidden access", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "blocked@example.com",
      name: "Blocked User",
      role: "tribemate",
      avatarFallback: "BU",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      reason: "blocked_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(infoMock).toHaveBeenCalledWith({
      message: "Tribe access hidden",
      metadata: expect.objectContaining({
        reason: "blocked_hidden",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });

  it("renders a subscription confirmation status instead of 404 after Mercado Pago returns", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "blocked@example.com",
      name: "Blocked User",
      role: "tribemate",
      avatarFallback: "BU",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      blockedReason: "payment_blocked",
      reason: "blocked_hidden",
    });
    validatePendingTribeMemberSubscriptionReturn.mockResolvedValue(true);

    render(
      await TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
        searchParams: Promise.resolve({
          preapproval_id: "preapproval-1",
        }),
      })
    );

    expect(notFound).not.toHaveBeenCalled();
    expect(listTribeRound).not.toHaveBeenCalled();
    expect(validatePendingTribeMemberSubscriptionReturn).toHaveBeenCalledWith({
      providerSubscriptionId: "preapproval-1",
      tribeSlug: "matematica-pro",
    });
    expect(
      screen.getByRole("heading", { name: "Estamos confirmando tu suscripción" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mercado Pago nos está avisando el resultado. En unos segundos vas a poder volver a entrar a la tribu."
      )
    ).toBeInTheDocument();
  });

  it("renders a subscription confirmation status when the provider is unavailable after Mercado Pago returns", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "blocked@example.com",
      name: "Blocked User",
      role: "tribemate",
      avatarFallback: "BU",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      blockedReason: "payment_blocked",
      reason: "blocked_hidden",
    });
    confirmTribeMemberSubscriptionReturn.mockResolvedValue({
      status: "provider_unavailable",
    });
    (createRequestModules as jest.Mock)
      .mockResolvedValueOnce({
        auth: {
          useCases: {
            getAuthenticatedMember,
          },
        },
        tribes: {
          useCases: {
            getTribePageAccess,
          },
        },
        messages: {
          useCases: {
            listTribeRound,
          },
        },
        subscriptions: {
          useCases: {
            confirmTribeMemberSubscriptionReturn: undefined,
            reconcileCurrentTribeMemberSubscription: undefined,
            validatePendingTribeMemberSubscriptionReturn,
          },
        },
      })
      .mockResolvedValueOnce({
        subscriptions: {
          useCases: {
            reconcileCurrentTribeMemberSubscription: undefined,
          },
        },
      })
      .mockResolvedValueOnce({
        subscriptions: {
          useCases: {
            confirmTribeMemberSubscriptionReturn,
          },
        },
      });

    render(
      await TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
        searchParams: Promise.resolve({
          preapproval_id: "preapproval-1",
        }),
      })
    );

    expect(notFound).not.toHaveBeenCalled();
    expect(listTribeRound).not.toHaveBeenCalled();
    expect(validatePendingTribeMemberSubscriptionReturn).not.toHaveBeenCalled();
    expect(confirmTribeMemberSubscriptionReturn).toHaveBeenCalledWith({
      providerSubscriptionId: "preapproval-1",
      tribeSlug: "matematica-pro",
    });
    expect(
      screen.getByRole("heading", { name: "Estamos confirmando tu suscripción" })
    ).toBeInTheDocument();
  });

  it("confirms Mercado Pago returns when previous reconciliation marked the member as subscription-inactive", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "blocked@example.com",
      name: "Blocked User",
      role: "tribemate",
      avatarFallback: "BU",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      blockedReason: "subscription_inactive",
      reason: "blocked_hidden",
    });
    confirmTribeMemberSubscriptionReturn.mockResolvedValue({
      status: "pending",
    });
    let createModulesCallCount = 0;

    (createRequestModules as jest.Mock).mockImplementation(async () => {
      createModulesCallCount += 1;

      if (createModulesCallCount === 3) {
        return {
          subscriptions: {
            useCases: {
              confirmTribeMemberSubscriptionReturn,
            },
          },
        };
      }

      return {
        auth: {
          useCases: {
            getAuthenticatedMember,
          },
        },
        tribes: {
          useCases: {
            getTribePageAccess,
          },
        },
        messages: {
          useCases: {
            listTribeRound,
          },
        },
        subscriptions: {
          useCases: {
            confirmTribeMemberSubscriptionReturn: undefined,
            reconcileCurrentTribeMemberSubscription: undefined,
            validatePendingTribeMemberSubscriptionReturn,
          },
        },
      };
    });

    render(
      await TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
        searchParams: Promise.resolve({
          preapproval_id: "preapproval-1",
        }),
      })
    );

    expect(notFound).not.toHaveBeenCalled();
    expect(confirmTribeMemberSubscriptionReturn).toHaveBeenCalledWith({
      providerSubscriptionId: "preapproval-1",
      tribeSlug: "matematica-pro",
    });
    expect(
      screen.getByRole("heading", { name: "Estamos confirmando tu suscripción" })
    ).toBeInTheDocument();
  });

  it("returns 404 when the Mercado Pago return id does not match a pending subscription", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "blocked@example.com",
      name: "Blocked User",
      role: "tribemate",
      avatarFallback: "BU",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      blockedReason: "payment_blocked",
      reason: "blocked_hidden",
    });
    validatePendingTribeMemberSubscriptionReturn.mockResolvedValue(false);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
        searchParams: Promise.resolve({
          preapproval_id: "preapproval-fake",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(validatePendingTribeMemberSubscriptionReturn).toHaveBeenCalledWith({
      providerSubscriptionId: "preapproval-fake",
      tribeSlug: "matematica-pro",
    });
    expect(listTribeRound).not.toHaveBeenCalled();
  });

  it("keeps conduct-blocked members hidden when the return URL includes a Mercado Pago preapproval", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "blocked@example.com",
      name: "Blocked User",
      role: "tribemate",
      avatarFallback: "BU",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      blockedReason: "conduct_blocked",
      reason: "blocked_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
        searchParams: Promise.resolve({
          preapproval_id: "preapproval-1",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listTribeRound).not.toHaveBeenCalled();
  });

  it("returns 404 and logs generic hidden access when the slug is not visible", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      reason: "not_found_or_not_visible",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribePage({
        params: Promise.resolve({
          slug: "missing-tribe",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(infoMock).toHaveBeenCalledWith({
      message: "Tribe access hidden",
      metadata: expect.objectContaining({
        reason: "not_found_or_not_visible",
        slug: "missing-tribe",
        viewerId: "member-1",
      }),
    });
  });

  it("returns 404 and logs unexpected repository failures", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getTribePageAccess.mockRejectedValue(new Error("Database exploded"));
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve tribe access",
      error: expect.any(Error),
      metadata: expect.objectContaining({
        reason: "unexpected_repository_error",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });
});
