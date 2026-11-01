import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, render as renderWithoutProviders, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReactElement, ReactNode } from "react";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { ThemedToaster } from "@golfo/ui";

import { AcademyHome } from "@/components/academy/academy-home";
import { navigateToUrl } from "@/lib/browser-navigation";
import { BROWSER_REQUEST_TIMEOUT_MESSAGE, BROWSER_REQUEST_TIMEOUT_MS } from "@/src/constants/browser-request";
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
    lastPaymentRejected: false,
    level: "basic",
    membershipRecovery: null,
    nextAction: "request_verification",
    renewalStatus: "none",
    ...overrides,
  };
}

/** Status of a member who reached the provider checkout and still owes its first payment. */
function pendingCheckoutAccess(overrides: Partial<AcademyAccessStatusDto> = {}): AcademyAccessStatusDto {
  return access({ eligibility: "verified", nextAction: "complete_checkout", renewalStatus: "pending", ...overrides });
}

/** Status of a member whose membership is inactive for a commercial reason. */
function inactiveMemberAccess(overrides: Partial<AcademyAccessStatusDto> = {}): AcademyAccessStatusDto {
  return access({ eligibility: "verified", nextAction: "contact_support", ...overrides });
}

describe("AcademyHome", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    refreshMock.mockReset();
  });

  it("should navigate to a protected admission request without posting a direct join or refreshing the route", () => {
    render(<AcademyHome access={null} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={{ ...offer, admissionRequiresRequest: true }} tribeSlug="synthetic-academy" />);
    expect(screen.getByRole("link", { name: "Solicitar ingreso" })).toHaveAttribute("href", "/admissions/synthetic-academy");
    expect(screen.queryByRole("button", { name: "Ingresar gratis" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("guides a basic member to verify before buying", () => {
    render(<AcademyHome access={access()} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

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
        canConfigureOffer={false} canManage={false}
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
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(
      screen.getByText("Tu acceso a la academia finalizó. Tu cuenta y tu progreso siguen guardados.")
    ).toBeInTheDocument();
  });

  it("starts the checkout once with the accepted offer version and price", async () => {
    const user = userEvent.setup();
    respondWithJson({ checkoutUrl: "https://www.mercadopago.com.ar/checkout/synthetic" }, 200);

    render(
      <AcademyHome
        access={access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" })}
        canConfigureOffer={false} canManage={false}
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
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      acceptedOfferVersion: 3,
      acceptedPrice: { amountCents: 1_500_000, currency: "ARS" },
    });
  });

  it("releases a hung checkout at the deadline so the member can try again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(navigateToUrl).mockClear();
      // The provider never answers: the request only settles when its signal aborts, as native fetch does.
      fetchMock.mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true });
      }));

      render(
        <AcademyHome
          access={access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" })}
          canConfigureOffer={false} canManage={false}
          isCheckoutReturn={false}
          offer={offer}
          tribeSlug="tribu"
        />
      );

      await user.click(screen.getByRole("button", { name: "Contratar academia" }));
      expect(await screen.findByRole("button", { name: "Abriendo el pago…" })).toBeDisabled();

      await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS); });

      expect(await screen.findAllByText(BROWSER_REQUEST_TIMEOUT_MESSAGE)).not.toHaveLength(0);
      expect(screen.getByRole("button", { name: "Contratar academia" })).toBeEnabled();
      expect(navigateToUrl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a pending checkout as waiting for its payment, with a way to continue it instead of a new purchase", () => {
    render(
      <AcademyHome
        access={pendingCheckoutAccess()}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(
      screen.getByText(
        "Tu suscripción espera el pago en Mercado Pago. Si ya pagaste, no hace falta que vuelvas a pagar; si no terminaste, podés continuar el pago."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar el pago" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Contratar academia" })).not.toBeInTheDocument();
  });

  it("resumes the pending checkout at the provider when the member continues the payment", async () => {
    const user = userEvent.setup();
    vi.mocked(navigateToUrl).mockClear();
    respondWithJson({ checkoutUrl: "https://www.mercadopago.com.ar/checkout/pending-synthetic" }, 200);

    render(<AcademyHome access={pendingCheckoutAccess()} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Continuar el pago" }));

    await waitFor(() =>
      expect(navigateToUrl).toHaveBeenCalledWith("https://www.mercadopago.com.ar/checkout/pending-synthetic")
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/tribes/tribu/academy/checkout");
  });

  it("re-renders the current offer when the checkout says it changed", async () => {
    const user = userEvent.setup();
    respondWithJson({ message: "La oferta cambió. Revisá las condiciones actualizadas antes de continuar.", status: "offer_changed" }, 409);

    render(
      <AcademyHome
        access={access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    await user.click(screen.getByRole("button", { name: "Contratar academia" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La oferta cambió.");
    expect(refreshMock).toHaveBeenCalledTimes(1);
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

    render(<AcademyHome access={paidAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

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
        canConfigureOffer={false} canManage={false}
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

  it("lets the member cancel a subscription still waiting for its payment, once and only after the server confirms it", async () => {
    const user = userEvent.setup();
    const pendingAccess = access({ eligibility: "verified", nextAction: "complete_checkout", renewalStatus: "pending" });
    respondWithJson({ message: "ok", status: "canceled" }, 200);
    respondWithJson({ ...pendingAccess, canStartCheckout: true, nextAction: "view_offer", renewalStatus: "canceled" }, 200);

    render(<AcademyHome access={pendingAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn offer={offer} tribeSlug="tribu" />);

    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Se cancela la suscripción que está esperando la confirmación del pago y no se generan cobros nuevos. Tu cuenta y tu progreso siguen guardados."
      )
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/acceso ya pagado/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.dblClick(within(dialog).getByRole("button", { name: "Sí, cancelar renovación" }));

    expect(
      await screen.findByText(
        "Cancelaste la suscripción que estaba esperando la confirmación del pago. No se generan cobros nuevos.",
        { selector: "p" }
      )
    ).toHaveAttribute("role", "status");
    const cancelRequests = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(cancelRequests).toHaveLength(1);
    expect(cancelRequests[0]?.[0]).toBe("/api/tribes/tribu/subscriptions/current?product=academy");
    expect(screen.queryByText(/Conservás el acceso hasta/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Estamos confirmando tu suscripción. No hace falta que vuelvas a pagar.")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar renovación" })).not.toBeInTheDocument();
  });

  it("keeps a failed cancellation of a pending subscription inside its dialog, without claiming it was canceled", async () => {
    const user = userEvent.setup();
    const pendingAccess = access({ eligibility: "verified", nextAction: "complete_checkout", renewalStatus: "pending" });
    respondWithJson({ message: "No pudimos contactar a Mercado Pago. Intentá de nuevo más tarde." }, 503);

    render(<AcademyHome access={pendingAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Sí, cancelar renovación" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "No pudimos contactar a Mercado Pago. Intentá de nuevo más tarde."
    );
    expect(within(dialog).getByRole("button", { name: "Sí, cancelar renovación" })).toBeEnabled();
    expect(screen.queryByText(/Cancelaste la suscripción/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets a signed-in visitor join for free and shows the new access right away", async () => {
    const user = userEvent.setup();
    respondWithJson({ message: "Te sumaste a la tribu.", status: "joined" }, 201);
    respondWithJson(access(), 200);

    render(<AcademyHome access={null} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Ingresar gratis" }));

    expect(await screen.findByRole("heading", { name: "Tu acceso" })).toBeInTheDocument();
    expect(screen.getByText("Te sumaste a la tribu.", { selector: "p" })).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Ingresar gratis" })).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/tribes/tribu/academy/join",
      "/api/tribes/tribu/academy/access",
    ]);
  });

  it("takes the access of the refreshed server render after joining", () => {
    const view = render(<AcademyHome access={null} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);
    expect(screen.getByRole("button", { name: "Ingresar gratis" })).toBeEnabled();

    // router.refresh() keeps client state and only passes the new server props.
    view.rerender(<AcademyHome access={access()} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    expect(screen.getByRole("heading", { name: "Tu acceso" })).toBeInTheDocument();
    expect(screen.getByText("Acceso básico")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ingresar gratis" })).not.toBeInTheDocument();
  });

  it("re-renders the offer when the academy now asks for an admission request", async () => {
    const user = userEvent.setup();
    respondWithJson({ code: "request_required", message: "Esta academia ahora pide una solicitud de ingreso.", requestId: "request-1" }, 409);

    render(<AcademyHome access={null} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Ingresar gratis" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esta academia ahora pide una solicitud de ingreso.");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offers a free join to a member left inactive by a subscription, with its own explanation", async () => {
    const user = userEvent.setup();
    respondWithJson({ message: "Te sumaste a la tribu.", status: "joined" }, 201);
    respondWithJson(access({ eligibility: "verified", nextAction: "view_offer" }), 200);

    render(
      <AcademyHome
        access={inactiveMemberAccess({ membershipRecovery: "free_join" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(
      screen.getByText("Tu membresía en la tribu está inactiva. Podés volver a ingresar a la academia.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Contactá a quien administra la tribu/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ingresar gratis" }));

    expect(await screen.findByText("Acceso básico")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ingresar gratis" })).not.toBeInTheDocument();
  });

  it("links an inactive member of a protected academy to the admission request", () => {
    render(
      <AcademyHome
        access={inactiveMemberAccess({ membershipRecovery: "admission_request" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={{ ...offer, admissionRequiresRequest: true }}
        tribeSlug="tribu"
      />
    );

    expect(screen.getByRole("link", { name: "Solicitar ingreso" })).toHaveAttribute("href", "/admissions/tribu");
    expect(screen.queryByRole("button", { name: "Ingresar gratis" })).not.toBeInTheDocument();
  });

  it("does not offer the courses nor an entry to a member who cannot recover the membership alone", () => {
    render(
      <AcademyHome
        access={inactiveMemberAccess()}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(
      screen.getByText("Tu membresía no permite usar la academia. Contactá a quien administra la tribu.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver cursos básicos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ingresar gratis" })).not.toBeInTheDocument();
  });

  it("explains that sales are paused", () => {
    render(
      <AcademyHome
        access={access()}
        canConfigureOffer={false} canManage={false}
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
        canConfigureOffer
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
        canConfigureOffer={false} canManage={false}
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
        canConfigureOffer
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

  it("tells a guardian that the leader has not loaded the offer, without offering to configure it", () => {
    render(
      <AcademyHome
        access={access({ eligibility: "verified", nextAction: "view_offer" })}
        canConfigureOffer={false}
        canManage
        isCheckoutReturn={false}
        offer={{ ...offer, benefits: [], description: "", price: null, title: "" }}
        tribeSlug="tribu"
      />
    );

    expect(screen.getByText("Quien lidera la tribu todavía no cargó la oferta.")).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no cargaste la oferta/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Configurar la oferta" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gestionar academia" })).toBeInTheDocument();
  });

  it("shows a renewal paused at the provider as paused, cancelable and without a new purchase", async () => {
    const user = userEvent.setup();

    render(
      <AcademyHome
        access={access({ eligibility: "verified", nextAction: "view_offer", renewalStatus: "paused" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(screen.getByText("Tu renovación está pausada en Mercado Pago.")).toBeInTheDocument();
    expect(screen.queryByText("La renovación está cancelada.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contratar academia" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Se detienen los próximos cobros. Tu cuenta y tu progreso siguen guardados.")).toBeInTheDocument();
    expect(within(dialog).queryByText(/acceso ya pagado/)).not.toBeInTheDocument();
  });

  it("lets the member retry a cancellation still pending confirmation", async () => {
    const user = userEvent.setup();
    const cancelingAccess = access({
      accessEndsAt: "2026-08-10T03:00:00.000Z",
      eligibility: "verified",
      hasPaidCoverage: true,
      level: "academy",
      nextAction: "continue_learning",
      renewalStatus: "canceling",
    });
    respondWithJson({ message: "Cancelaste la renovación. Conservás el acceso ya pagado hasta su vencimiento.", status: "canceled" }, 200);
    respondWithJson({ ...cancelingAccess, renewalStatus: "canceled" }, 200);

    render(<AcademyHome access={cancelingAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    expect(screen.getByText("La cancelación de tu renovación está pendiente de confirmación.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Reintentar cancelación" }));
    await user.click(await screen.findByRole("button", { name: "Sí, cancelar renovación" }));

    expect(
      await screen.findByText("Cancelaste la renovación. Conservás el acceso hasta el 10 ago 2026.", { selector: "p" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar cancelación" })).not.toBeInTheDocument();
  });

  it("asks the member to review the payment method when the provider rejected the last payment", () => {
    render(
      <AcademyHome
        access={access({ eligibility: "verified", lastPaymentRejected: true, nextAction: "view_offer", renewalStatus: "active" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(
      screen.getByText(
        "Mercado Pago rechazó el último cobro. Revisá tu medio de pago en Mercado Pago y después tocá «Actualizar estado»."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Estamos confirmando tu suscripción/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
  });

  it("does not promise paid access when cancelling a renewal whose first payment is not confirmed", async () => {
    const user = userEvent.setup();

    render(
      <AcademyHome
        access={access({ eligibility: "verified", nextAction: "view_offer", renewalStatus: "active" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("¿Cancelar la suscripción a la academia?")).toBeInTheDocument();
    expect(within(dialog).queryByText(/acceso ya pagado/)).not.toBeInTheDocument();
  });

  it("keeps the dialog open while the cancellation is in flight and shows its answer", async () => {
    const user = userEvent.setup();
    let answerCancellation: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { answerCancellation = resolve; }));

    render(
      <AcademyHome
        access={access({ eligibility: "verified", hasPaidCoverage: true, level: "academy", nextAction: "continue_learning", renewalStatus: "active" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Sí, cancelar renovación" }));
    expect(await within(dialog).findByRole("button", { name: "Cancelando…" })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Cerrar diálogo" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      answerCancellation(new Response(JSON.stringify({ message: "No pudimos contactar a Mercado Pago. Tu renovación sigue activa; intentá de nuevo más tarde." }), { headers: { "Content-Type": "application/json" }, status: 503 }));
    });

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("No pudimos contactar a Mercado Pago.");
  });

  it("rereads the renewal when there is nothing left to cancel", async () => {
    const user = userEvent.setup();
    const paidAccess = access({
      accessEndsAt: "2026-08-10T03:00:00.000Z",
      eligibility: "verified",
      hasPaidCoverage: true,
      level: "academy",
      nextAction: "continue_learning",
      renewalStatus: "active",
    });
    respondWithJson({ message: "No encontramos una renovación activa para cancelar." }, 404);
    respondWithJson({ ...paidAccess, renewalStatus: "canceled" }, 200);

    render(<AcademyHome access={paidAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    await user.click(await screen.findByRole("button", { name: "Sí, cancelar renovación" }));

    expect(await screen.findByText("La renovación está cancelada.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("No encontramos una renovación activa para cancelar.");
    expect(screen.queryByRole("button", { name: "Cancelar renovación" })).not.toBeInTheDocument();
  });

  it("stops offering the cancellation the server confirmed even when the reread fails", async () => {
    const user = userEvent.setup();
    const paidAccess = access({
      accessEndsAt: "2026-08-10T03:00:00.000Z",
      eligibility: "verified",
      hasPaidCoverage: true,
      level: "academy",
      nextAction: "continue_learning",
      renewalStatus: "active",
    });
    respondWithJson({ message: "Cancelaste la renovación. Conservás el acceso ya pagado hasta su vencimiento.", status: "canceled" }, 200);
    respondWithJson({ message: "Servicio no disponible." }, 503);

    render(<AcademyHome access={paidAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    await user.click(await screen.findByRole("button", { name: "Sí, cancelar renovación" }));

    expect(
      await screen.findByText("Cancelaste la renovación. Conservás el acceso hasta el 10 ago 2026.", { selector: "p" })
    ).toBeInTheDocument();
    expect(screen.getByText("La renovación está cancelada.")).toBeInTheDocument();
    expect(screen.queryByText("Tu renovación mensual está activa.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar renovación" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos leer tu estado actualizado.");
  });

  it("keeps the status refresh after a failed reread of a canceled pending subscription, so the member can buy again without reloading", async () => {
    const user = userEvent.setup();
    const pendingAccess = pendingCheckoutAccess();
    respondWithJson({ message: "ok", status: "canceled" }, 200);
    respondWithJson({ message: "Servicio no disponible." }, 503);

    render(<AcademyHome access={pendingAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    await user.click(await screen.findByRole("button", { name: "Sí, cancelar renovación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos leer tu estado actualizado.");
    expect(screen.queryByRole("button", { name: "Cancelar renovación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contratar academia" })).not.toBeInTheDocument();

    respondWithJson({ message: null, status: "not_found" }, 404);
    respondWithJson({ ...pendingAccess, canStartCheckout: true, nextAction: "view_offer", renewalStatus: "canceled" }, 200);
    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));

    expect(await screen.findByRole("button", { name: "Contratar academia" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Actualizar estado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar renovación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a cancellation recorded but not yet confirmed by the provider", async () => {
    const user = userEvent.setup();
    const paidAccess = access({
      accessEndsAt: "2026-08-10T03:00:00.000Z",
      eligibility: "verified",
      hasPaidCoverage: true,
      level: "academy",
      nextAction: "continue_learning",
      renewalStatus: "active",
    });
    const unconfirmed =
      "Registramos tu pedido de cancelación, pero Mercado Pago todavía no lo confirmó. Tocá «Actualizar estado» en unos minutos para confirmarlo.";
    respondWithJson({ message: unconfirmed, status: "cancel_unconfirmed" }, 202);
    respondWithJson({ ...paidAccess, renewalStatus: "canceling" }, 200);

    render(<AcademyHome access={paidAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    await user.click(await screen.findByRole("button", { name: "Sí, cancelar renovación" }));

    expect(await screen.findByText(unconfirmed, { selector: "p" })).toHaveAttribute("role", "status");
    expect(screen.queryByText(/Cancelaste la renovación/)).not.toBeInTheDocument();
    expect(screen.getByText("La cancelación de tu renovación está pendiente de confirmación.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar cancelación" })).toBeEnabled();
  });

  it("announces a failed cancellation once, inside the dialog where it happened", async () => {
    const user = userEvent.setup();
    respondWithJson({ message: "No pudimos contactar a Mercado Pago." }, 503);

    render(
      <>
        <AcademyHome
          access={access({ eligibility: "verified", hasPaidCoverage: true, level: "academy", renewalStatus: "active" })}
          canConfigureOffer={false} canManage={false}
          isCheckoutReturn={false}
          offer={offer}
          tribeSlug="tribu"
        />
        <ThemedToaster />
      </>
    );

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    await user.click(screen.getByRole("button", { name: "Sí, cancelar renovación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos contactar a Mercado Pago.");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.getAllByText("No pudimos contactar a Mercado Pago.")).toHaveLength(1);
  });
  it("clears a failed cancellation from the page and from the dialog when it opens again", async () => {
    const user = userEvent.setup();
    respondWithJson({ message: "No pudimos contactar a Mercado Pago." }, 503);

    render(
      <AcademyHome
        access={access({ eligibility: "verified", hasPaidCoverage: true, level: "academy", renewalStatus: "active" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    await user.click(screen.getByRole("button", { name: "Sí, cancelar renovación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos contactar a Mercado Pago.");

    await user.click(screen.getByRole("button", { name: "Mantener renovación" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar renovación" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not offer a second checkout while the payment of a checkout return is being confirmed", () => {
    render(
      <AcademyHome
        access={access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn
        offer={offer}
        tribeSlug="tribu"
      />
    );

    expect(
      screen.getByText("Estamos confirmando tu suscripción. No hace falta que vuelvas a pagar.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contratar academia" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
  });

  it("leaves the confirmation state when the server reports no payment in progress", async () => {
    const user = userEvent.setup();
    const basicAccess = access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" });
    respondWithJson({ message: "No encontramos el recurso.", status: "not_found" }, 404);
    respondWithJson(basicAccess, 200);

    render(<AcademyHome access={basicAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));

    expect(
      await screen.findByText(
        "No encontramos un pago confirmado. Si no terminaste de pagar, podés contratar la academia de nuevo."
      )
    ).toHaveAttribute("role", "status");
    expect(
      screen.queryByText("Estamos confirmando tu suscripción. No hace falta que vuelvas a pagar.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contratar academia" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps waiting with its refresh when the subscription is active but its first payment is not confirmed yet", async () => {
    const user = userEvent.setup();
    const authorizedAccess = access({ eligibility: "verified", nextAction: "view_offer", renewalStatus: "active" });
    respondWithJson({ message: null, status: "reconciled" }, 200);
    respondWithJson(authorizedAccess, 200);

    render(<AcademyHome access={access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" })} canConfigureOffer={false} canManage={false} isCheckoutReturn offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));

    expect(
      await screen.findByText(
        "Todavía no recibimos la confirmación del pago. Volvé a comprobar en unos minutos; no hace falta que pagues de nuevo."
      )
    ).toHaveAttribute("role", "status");
    expect(screen.getByText("Estamos confirmando tu suscripción. No hace falta que vuelvas a pagar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Contratar academia" })).not.toBeInTheDocument();
  });

  it("keeps the checkout locked while the provider opens and releases it when the page is restored", async () => {
    const user = userEvent.setup();
    vi.mocked(navigateToUrl).mockClear();
    respondWithJson({ checkoutUrl: "https://www.mercadopago.com.ar/checkout/synthetic" }, 200);

    render(
      <AcademyHome
        access={access({ canStartCheckout: true, eligibility: "verified", nextAction: "view_offer" })}
        canConfigureOffer={false} canManage={false}
        isCheckoutReturn={false}
        offer={offer}
        tribeSlug="tribu"
      />
    );

    await user.click(screen.getByRole("button", { name: "Contratar academia" }));
    await waitFor(() => expect(navigateToUrl).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Abriendo el pago…" })).toBeDisabled();

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(screen.getByRole("button", { name: "Contratar academia" })).toBeEnabled();
  });

  it("explains a throttled refresh next to the action instead of ignoring it", async () => {
    const user = userEvent.setup();
    const pendingAccess = access({ eligibility: "verified", nextAction: "complete_checkout", renewalStatus: "pending" });
    respondWithJson({ message: "Ya revisamos tu estado hace instantes. Probá de nuevo en un minuto.", status: "throttled" }, 200);
    respondWithJson(pendingAccess, 200);

    render(<AcademyHome access={pendingAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));

    expect(
      await screen.findByText("Ya revisamos tu estado hace instantes. Probá de nuevo en un minuto.")
    ).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
  });

  it("reports a failed status reread and lets the member try again", async () => {
    const user = userEvent.setup();
    const pendingAccess = access({ eligibility: "verified", nextAction: "complete_checkout", renewalStatus: "pending" });
    respondWithJson({ message: null, status: "reconciled" }, 200);
    respondWithJson({ message: "Servicio no disponible." }, 503);

    render(<AcademyHome access={pendingAccess} canConfigureOffer={false} canManage={false} isCheckoutReturn={false} offer={offer} tribeSlug="tribu" />);

    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos leer tu estado actualizado. Intentá de nuevo en unos segundos."
    );

    respondWithJson({ message: null, status: "reconciled" }, 200);
    respondWithJson(pendingAccess, 200);
    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));

    expect(
      await screen.findByText(
        "Todavía no recibimos la confirmación del pago. Volvé a comprobar en unos minutos; no hace falta que pagues de nuevo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
