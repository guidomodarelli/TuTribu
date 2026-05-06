import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribePricesPage from "@/app/(platform)/tribu/[slug]/precios/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const listTribeSubscriptionPrices = jest.fn();
const errorMock = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/components/subscriptions/tribe-subscription-price-management", () => ({
  TribeSubscriptionPriceManagement: ({
    canManagePrices,
    prices,
    tribeSlug,
  }: {
    canManagePrices: boolean;
    prices: unknown[];
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestión de precios</h1>
      <p>{tribeSlug}</p>
      <p>{canManagePrices ? "opera" : "lee"}</p>
      <p>{prices.length}</p>
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
  email: "leader@example.com",
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

describe("TribePricesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listTribeSubscriptionPrices.mockResolvedValue({
      prices: [
        {
          activeSubscribersCount: 0,
          amountCents: 500000,
          createdAt: "2026-05-06T12:00:00.000Z",
          currency: "ARS",
          frequency: "monthly",
          id: "price-1",
          isCurrent: true,
          name: "Plan mensual",
          status: "active",
        },
      ],
      viewerPermissions: {
        canManagePrices: true,
        canViewPrices: true,
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      error: errorMock,
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
          listTribeSubscriptionPrices,
        },
      },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          getTribePageAccess,
        },
      },
    });
  });

  it("renders operational price management for leaders", async () => {
    render(await TribePricesPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de precios" })).toBeInTheDocument();
    expect(screen.getByText("opera")).toBeInTheDocument();
  });

  it("renders read-only price management for guardians", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listTribeSubscriptionPrices.mockResolvedValue({
      prices: [],
      viewerPermissions: {
        canManagePrices: false,
        canViewPrices: true,
      },
    });

    render(await TribePricesPage(buildPageProps()));

    expect(screen.getByText("lee")).toBeInTheDocument();
  });

  it("returns 404 when a regular member opens price management", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribePricesPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(listTribeSubscriptionPrices).not.toHaveBeenCalled();
  });
});
