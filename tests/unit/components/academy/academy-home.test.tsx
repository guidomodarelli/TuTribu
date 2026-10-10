import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render as renderWithoutProviders, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReactElement, ReactNode } from "react";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";

import { AcademyHome } from "@/components/academy/academy-home";
import { navigateToUrl } from "@/lib/browser-navigation";
import type {
  AcademyAccessStatusDto,
  AcademyOfferDto,
} from "@/src/modules/product-access/application/results/academy-public-dto-schemas";

// Project-owned navigation boundary: jsdom cannot navigate to the provider.
vi.mock("@/lib/browser-navigation", () => ({ navigateToUrl: vi.fn() }));

const fetchMock = global.fetch as Mock;
const refreshMock = vi.fn();
const router = { back: vi.fn(), bfcacheId: "academy-home-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: refreshMock, replace: vi.fn() } satisfies AppRouterInstance;
/** Real framework/UI providers preserve shared Link and Motion behavior without library mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }
/** Renders the product through its actual provider composition. */
function render(element: ReactElement) { return renderWithoutProviders(element, { wrapper: Providers }); }

function respondWithJson(body: unknown, status: number) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })
  );
}

const offer: AcademyOfferDto = {
  admissionEnabled: true,
  admissionRequiresRequest: false,
  benefits: ["Clases en vivo grabadas"],
  description: "Formación ordenada",
  offerVersion: 3,
  price: { amountCents: 1_500_000, currency: "ARS", frequency: "monthly" },
  salesEnabled: true,
  title: "Academia sintética",
  tribeName: "Tribu",
};

function access(overrides: Partial<AcademyAccessStatusDto> = {}): AcademyAccessStatusDto {
  return {
    accessEndsAt: null,
    accessModel: "academy",
    canStartCheckout: false,
    eligibility: "not_requested",
    firstActivatedAt: null,
    hasBonusCoverage: false,
    hasPaidCoverage: false,
    isLeaderPreview: false,
    level: "basic",
    nextAction: "request_verification",
    renewalStatus: "none",
    ...overrides,
  };
}

describe("AcademyHome", () => {
  it("should navigate to a protected admission request without posting a direct join or refreshing the route", () => {
    render(<AcademyHome access={null} canManage={false} isCheckoutReturn={false} offer={{ ...offer, admissionRequiresRequest: true }} tribeSlug="synthetic-academy" />);
    expect(screen.getByRole("link", { name: "Solicitar ingreso" })).toHaveAttribute("href", "/admissions/synthetic-academy");
    expect(screen.queryByRole("button", { name: "Ingresar gratis" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    refreshMock.mockReset();
  });

  it("guides a basic member to verify before buying", () => {
    render(<AcademyHome access={access()} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    expect(screen.getByText("Confirmá tu vinculación para acceder a la academia.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Solicitar verificación" })).toHaveAttribute(
      "href",
      "/tribu/academia/verificacion"
    );
    expect(screen.queryByRole("button", { name: "Contratar academia" })).not.toBeInTheDocument();
    expect(screen.getByText("$ 15.000 por mes")).toBeInTheDocument();
  });

  it("shows a bonus with its end date", () => {
    render(
      <AcademyHome
        access={access({
          accessEndsAt: "2026-07-16T03:00:00.000Z",
          eligibility: "verified",
          hasBonusCoverage: true,
          level: "academy",
          nextAction: "continue_learning",
        })}
        canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(screen.getByText("Tenés acceso bonificado hasta el 16 jul 2026.")).toBeInTheDocument();
  });

  it("keeps account and progress after the access ends", () => {
    render(
      <AcademyHome
        access={access({ eligibility: "verified", firstActivatedAt: "2026-01-01T03:00:00.000Z" })}
        canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(
      screen.getByText("Tu acceso a la academia finalizó. Tu cuenta y tu progreso siguen guardados.")
    ).toBeInTheDocument();
  });

  it("starts the checkout once with the accepted offer version", async () => {
    const user = userEvent.setup();
    respondWithJson({ checkoutUrl: "https://www.mercadopago.com.ar/checkout/synthetic" }, 200);

    render(
      <AcademyHome
        access={access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" })}
        canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    const button = screen.getByRole("button", { name: "Contratar academia" });
    await user.dblClick(button);

    await waitFor(() =>
      expect(navigateToUrl).toHaveBeenCalledWith("https://www.mercadopago.com.ar/checkout/synthetic")
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ acceptedOfferVersion: 3 });
  });

  it("shows the confirmation state on a checkout return instead of a new purchase", () => {
    render(
      <AcademyHome
        access={access({ eligibility: "verified", nextAction: "complete_checkout", renewalStatus: "pending" })}
        canManage={false}
        isCheckoutReturn
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(
      screen.getByText("Estamos confirmando tu suscripción. No hace falta que vuelvas a pagar.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();
  });

  it("announces the cancellation only after the server confirms it", async () => {
    const user = userEvent.setup();
    const paidAccess = access({
      accessEndsAt: "2026-08-10T03:00:00.000Z",
      eligibility: "verified",
      hasPaidCoverage: true,
      level: "academy",
      nextAction: "continue_learning",
      renewalStatus: "active",
    });
    respondWithJson({ message: "ok", status: "canceled" }, 200);
    respondWithJson({ ...paidAccess, renewalStatus: "canceled" }, 200);

    render(<AcademyHome access={paidAccess} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    expect(screen.queryByText(/Cancelaste la renovación/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sí, cancelar renovación" }));

    expect(
      await screen.findByText("Cancelaste la renovación. Conservás el acceso hasta el 10 ago 2026.", {
        selector: "p",
      })
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/tribes/tribu/subscriptions/current?product=academy");
  });

  it("keeps the error visible when the cancellation is not confirmed", async () => {
    const user = userEvent.setup();
    respondWithJson({ message: "No pudimos contactar a Mercado Pago." }, 503);

    render(
      <AcademyHome
        access={access({ eligibility: "verified", hasPaidCoverage: true, level: "academy", renewalStatus: "active" })}
        canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    await user.click(screen.getByRole("button", { name: "Sí, cancelar renovación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos contactar a Mercado Pago.");
    expect(screen.queryByText(/Cancelaste la renovación/)).not.toBeInTheDocument();
  });

  it("lets a signed-in visitor join for free and refreshes the access", async () => {
    const user = userEvent.setup();
    respondWithJson({ message: "Te sumaste a la tribu.", status: "joined" }, 201);

    render(<AcademyHome access={null} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Ingresar gratis" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/tribes/tribu/academy/join");
  });

  it("explains that sales are paused", () => {
    render(
      <AcademyHome
        access={access()}
        canManage={false}
        isCheckoutReturn={false}
        offer={{ ...offer, salesEnabled: false }}
        tribeSlug="tribu"
      />
    );

    expect(screen.getByText("La venta de la academia está pausada.")).toBeInTheDocument();
  });

  it("shows the leader preview without asking the leader to verify or buy", () => {
    render(
      <AcademyHome
        access={access({ isLeaderPreview: true })}
        canManage
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(screen.getByText("Vista de líder")).toBeInTheDocument();
    expect(screen.getByText("Como líder ves todo el contenido de la academia.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Solicitar verificación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Pasos para acceder a la academia" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a los cursos" })).toHaveAttribute("href", "/tribu/cursos");
  });

  it("marks the verification step as done and the purchase as the current step", () => {
    render(
      <AcademyHome
        access={access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" })}
        canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    const steps = screen.getAllByRole("listitem").filter((item) => item.closest("ol"));

    expect(steps[0]).toHaveTextContent("Tu vinculación está verificada.");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).toContainElement(screen.getByRole("button", { name: "Contratar academia" }));
  });

  it("guides the leader to configure an empty offer", () => {
    render(
      <AcademyHome
        access={access({ isLeaderPreview: true })}
        canManage
        isCheckoutReturn={false}
        offer={{ ...offer, benefits: [], description: "", price: null, title: "" }}
        tribeSlug="tribu"
      />
    );

    expect(screen.getByText(/Todavía no cargaste la oferta/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurar la oferta" })).toHaveAttribute(
      "href",
      "/tribu/academia/gestionar"
    );
  });
});
