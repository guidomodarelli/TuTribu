import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeSubscriptionPage from "@/app/(platform)/[slug]/suscripcion/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getTribePageAccess = jest.fn();
const reconcileCurrentTribeMemberSubscription = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/components/subscriptions/tribe-subscription-self-management", () => ({
  TribeSubscriptionSelfManagement: ({
    subscriptionStatus,
    tribeSlug,
  }: {
    subscriptionStatus: string;
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestión de suscripción</h1>
      <p>{subscriptionStatus}</p>
      <p>{tribeSlug}</p>
    </section>
  ),
}));

jest.mock("@/components/subscriptions/tribe-subscription-payment-status", () => ({
  TribeSubscriptionPaymentStatus: ({
    subscriptionStatus,
    tribeSlug,
  }: {
    subscriptionStatus: string;
    tribeSlug: string;
  }) => (
    <section>
      <h1>Estado de pago</h1>
      <p>{subscriptionStatus}</p>
      <p>{tribeSlug}</p>
    </section>
  ),
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

const authenticatedMember = {
  avatarFallback: "GH",
  email: "member@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "tribemate",
};

const visibleTribeAccess = {
  status: "visible",
  tribe: {
    id: "tribe-1",
    name: "Matematica Pro",
    slug: "matematica-pro",
    visibility: "private",
  },
};

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("TribeSubscriptionPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (notFound as unknown as jest.Mock).mockReset();
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    reconcileCurrentTribeMemberSubscription.mockResolvedValue({
      status: "active",
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      subscriptions: {
        useCases: {
          reconcileCurrentTribeMemberSubscription,
        },
      },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getTribePageAccess,
        },
      },
    });
  });

  it("renders active subscription self-management", async () => {
    render(await TribeSubscriptionPage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Gestión de suscripción" })
    ).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("matematica-pro")).toBeInTheDocument();
  });

  it("returns 404 for muted members with an active subscription", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue("muted");
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeSubscriptionPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it.each([
    ["pending", "payment_blocked", "pending"],
    ["paused", "subscription_inactive", "paused"],
    ["not_found", "subscription_inactive", "canceled"],
    ["not_found", "payment_blocked", "payment_blocked"],
  ])(
    "renders %s payment state for %s hidden access",
    async (
      reconciliationStatus,
      blockedReason,
      expectedSubscriptionStatus
    ) => {
      getTribePageAccess.mockResolvedValue({
        status: "hidden",
        reason: "blocked_hidden",
        blockedReason,
      });
      reconcileCurrentTribeMemberSubscription.mockResolvedValue({
        status: reconciliationStatus,
      });

      render(await TribeSubscriptionPage(buildPageProps()));

      expect(
        screen.getByRole("heading", { name: "Estado de pago" })
      ).toBeInTheDocument();
      expect(screen.getByText(expectedSubscriptionStatus)).toBeInTheDocument();
    }
  );

  it("returns 404 for conduct-blocked members", async () => {
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      reason: "blocked_hidden",
      blockedReason: "conduct_blocked",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeSubscriptionPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it.each(["pending", "paused"])(
    "returns 404 for conduct-blocked members even when reconciliation is %s",
    async (reconciliationStatus) => {
      getTribePageAccess.mockResolvedValue({
        status: "hidden",
        reason: "blocked_hidden",
        blockedReason: "conduct_blocked",
      });
      reconcileCurrentTribeMemberSubscription.mockResolvedValue({
        status: reconciliationStatus,
      });
      (notFound as unknown as jest.Mock).mockImplementation(() => {
        throw new Error("NEXT_NOT_FOUND");
      });

      await expect(TribeSubscriptionPage(buildPageProps())).rejects.toThrow(
        "NEXT_NOT_FOUND"
      );
    }
  );

  it("returns 404 for unauthenticated access", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      reason: "unauthenticated_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeSubscriptionPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });
});
