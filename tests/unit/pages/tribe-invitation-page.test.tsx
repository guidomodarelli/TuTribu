import { render, screen } from "@testing-library/react";
import { createHash } from "crypto";
import { redirect } from "next/navigation";

import TribeInvitationPage, {
  acceptInvitationAction,
  startInvitationSubscriptionAction,
} from "@/app/(platform)/tribu/[slug]/invitar/[token]/page";
import { createRequestModules } from "@/src/modules/setup";

const mockGetSession = jest.fn();
const getAuthenticatedMember = jest.fn();
const acceptTribeInvitation = jest.fn();
const getTribeInvitationSubscriptionOffer = jest.fn();
const getTribeWelcomeByInvitation = jest.fn();
const startTribeMemberSubscription = jest.fn();

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/auth/infrastructure/better-auth/server-auth-context",
  () => ({
    getServerBetterAuthSession: (...args: unknown[]) => mockGetSession(...args),
  })
);

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
      token: "invitation-token",
    }),
  };
}

function buildPagePropsWithStatus(status: string) {
  return {
    ...buildPageProps(),
    searchParams: Promise.resolve({
      status,
    }),
  };
}

describe("TribeInvitationPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: {
        id: "member-1",
      },
    });
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "member@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    acceptTribeInvitation.mockResolvedValue({
      status: "accepted",
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          acceptTribeInvitation,
          getTribeInvitationSubscriptionOffer,
          getTribeWelcomeByInvitation,
        },
      },
      subscriptions: {
        useCases: {
          startTribeMemberSubscription,
        },
      },
    });
    getTribeInvitationSubscriptionOffer.mockResolvedValue({
      price: {
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available",
    });
    getTribeWelcomeByInvitation.mockResolvedValue({
      links: [
        {
          id: "link-1",
          isActive: true,
          label: "Grupo de soporte",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: "custom_button",
          url: "https://soporte.example.com",
        },
      ],
      rules: [
        {
          id: "rule-1",
          isActive: true,
          label: "Presentate al entrar",
          sortOrder: 1,
        },
      ],
      welcomeMessage: "Bienvenido/a a Matematica Pro",
    });
  });

  it("redirects unauthenticated visitors to sign in with the invitation callback", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(TribeInvitationPage(buildPageProps())).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(
      "/auth/signin?callbackUrl=/tribu/matematica-pro/invitar/invitation-token"
    );
    expect(acceptTribeInvitation).not.toHaveBeenCalled();
  });

  it("renders the welcome screen before accepting during GET", async () => {
    render(await TribeInvitationPage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Bienvenida" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Acuerdos de convivencia")
    ).toBeInTheDocument();
    expect(screen.getByText("Presentate al entrar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Comenzar" })
    ).toBeInTheDocument();
    expect(getTribeWelcomeByInvitation).toHaveBeenCalledWith({
      token: "invitation-token",
      tribeSlug: "matematica-pro",
    });
    expect(acceptTribeInvitation).not.toHaveBeenCalled();
  });

  it("renders the subscription payment form when the invitation requires a subscription", async () => {
    render(await TribeInvitationPage(buildPagePropsWithStatus("subscription_required")));

    expect(
      screen.getByRole("heading", { name: "Completá tu suscripción" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continuar con el pago" })
    ).toBeInTheDocument();
    expect(screen.getByText("Plan mensual")).toBeInTheDocument();
    expect(screen.getByText("Precio mensual")).toBeInTheDocument();
    expect(screen.getByText(/5\.000/)).toBeInTheDocument();
    expect(screen.getByText("Estado: disponible")).toBeInTheDocument();
    expect(getTribeInvitationSubscriptionOffer).toHaveBeenCalledWith({
      token: "invitation-token",
      tribeSlug: "matematica-pro",
    });
    expect(acceptTribeInvitation).not.toHaveBeenCalled();
    expect(startTribeMemberSubscription).not.toHaveBeenCalled();
  });

  it("accepts a valid invitation from the POST action and redirects to the tribe", async () => {
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      acceptInvitationAction({
        slug: "matematica-pro",
        token: "invitation-token",
      })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(acceptTribeInvitation).toHaveBeenCalledWith({
      token: "invitation-token",
      tribeSlug: "matematica-pro",
    });
    expect(redirect).toHaveBeenCalledWith("/tribu/matematica-pro");
  });

  it("renders a safe Spanish message for blocked members", async () => {
    render(await TribeInvitationPage(buildPagePropsWithStatus("blocked")));

    expect(
      screen.getByRole("heading", { name: "No pudimos sumar tu cuenta" })
    ).toBeInTheDocument();
  });

  it("renders a safe Spanish message for revoked invitations", async () => {
    render(await TribeInvitationPage(buildPagePropsWithStatus("revoked")));

    expect(
      screen.getByRole("heading", { name: "Esta invitación no está disponible" })
    ).toBeInTheDocument();
  });

  it("redirects invalid acceptance action results back to a safe status page", async () => {
    acceptTribeInvitation.mockResolvedValue({
      status: "invalid",
    });
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      acceptInvitationAction({
        slug: "matematica-pro",
        token: "invitation-token",
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(
      "/tribu/matematica-pro/invitar/invitation-token?status=invalid"
    );
  });

  it("redirects payment start failures back to the tokenized invitation status page", async () => {
    startTribeMemberSubscription.mockResolvedValue({
      status: "payment_blocked",
    });
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      startInvitationSubscriptionAction({
        slug: "matematica-pro",
        token: "invitation-token",
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(startTribeMemberSubscription).toHaveBeenCalledWith({
      idempotencyKey: [
        "member-1",
        "matematica-pro",
        hashInvitationToken("invitation-token"),
      ].join(":"),
      invitationToken: "invitation-token",
      tribeSlug: "matematica-pro",
    });
    expect(redirect).toHaveBeenCalledWith(
      "/tribu/matematica-pro/invitar/invitation-token?status=payment_blocked"
    );
  });

  it("redirects subscription starts to the Mercado Pago plan checkout", async () => {
    startTribeMemberSubscription.mockResolvedValue({
      checkoutUrl:
        "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=provider-plan-1",
      status: "pending",
    });
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      startInvitationSubscriptionAction({
        slug: "matematica-pro",
        token: "invitation-token",
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(
      "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=provider-plan-1"
    );
  });

  it("redirects unexpected payment start errors to a safe status page", async () => {
    startTribeMemberSubscription.mockRejectedValue(new Error("provider timeout"));
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      startInvitationSubscriptionAction({
        slug: "matematica-pro",
        token: "invitation-token",
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(
      "/tribu/matematica-pro/invitar/invitation-token?status=payment_blocked"
    );
  });

  it("renders an already-subscribed status with a link back to the tribe", async () => {
    render(await TribeInvitationPage(buildPagePropsWithStatus("already_subscribed")));

    expect(
      screen.getByRole("heading", { name: "Ya estás suscripto a esta tribu" })
    ).toBeInTheDocument();
    const tribeLink = screen.getByRole("link", { name: "Ir a la tribu" });

    expect(tribeLink).toBeInTheDocument();
    expect(tribeLink).toHaveAttribute("href", "/tribu/matematica-pro");
  });

  it("renders a safe Spanish message when payment cannot start", async () => {
    render(await TribeInvitationPage(buildPagePropsWithStatus("missing_current_price")));

    expect(
      screen.getByRole("heading", { name: "No pudimos iniciar el pago" })
    ).toBeInTheDocument();
  });
});
