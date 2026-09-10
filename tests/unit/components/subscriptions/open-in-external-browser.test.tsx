import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OpenInExternalBrowser } from "@/components/subscriptions/open-in-external-browser";
import * as browserNavigation from "@/lib/browser-navigation";

vi.mock("@/lib/browser-navigation", () => ({
  navigateToUrl: vi.fn(),
}));

const EXTERNAL_BROWSER_URL =
  "x-safari-https://tutribu.example.com/matematica-pro?preapproval_id=preapproval-1";
const FALLBACK_SIGN_IN_URL =
  "/auth/signin?callbackUrl=%2Fmatematica-pro%3Fpreapproval_id%3Dpreapproval-1";
const COUNTDOWN_MESSAGE =
  "Cuando el contador llegue a 0, te vamos a redirigir al flujo para continuar con tu suscripción y quedar dentro de la tribu.";

describe("OpenInExternalBrowser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(browserNavigation.navigateToUrl).mockReset();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders the handoff copy with the primary action, countdown, and fallback link", () => {
    render(
      <OpenInExternalBrowser
        externalBrowserUrl={EXTERNAL_BROWSER_URL}
        fallbackSignInUrl={FALLBACK_SIGN_IN_URL}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Abrí TuTribu en tu navegador" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Suscripción confirmada")).not.toBeInTheDocument();
    expect(screen.getByText("Suscripción pendiente")).toBeInTheDocument();
    expect(screen.getByText(COUNTDOWN_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continuar en tu navegador" })
    ).toHaveAttribute("href", EXTERNAL_BROWSER_URL);
    expect(
      screen.getByRole("link", { name: "O continuá con inicio de sesión acá" })
    ).toHaveAttribute("href", FALLBACK_SIGN_IN_URL);
  });

  it("automatically navigates to the sign-in fallback when the countdown reaches zero", () => {
    render(
      <OpenInExternalBrowser
        externalBrowserUrl={EXTERNAL_BROWSER_URL}
        fallbackSignInUrl={FALLBACK_SIGN_IN_URL}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(browserNavigation.navigateToUrl).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(browserNavigation.navigateToUrl).toHaveBeenCalledWith(
      FALLBACK_SIGN_IN_URL
    );
  });

  it("navigates to the sign-in fallback when the deep link does not take the user away", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <OpenInExternalBrowser
        externalBrowserUrl={EXTERNAL_BROWSER_URL}
        fallbackSignInUrl={FALLBACK_SIGN_IN_URL}
      />
    );

    await user.click(
      screen.getByRole("link", { name: "Continuar en tu navegador" })
    );

    expect(browserNavigation.navigateToUrl).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(browserNavigation.navigateToUrl).toHaveBeenCalledWith(
      FALLBACK_SIGN_IN_URL
    );
  });

  it("gives the primary action its fallback window when the countdown is almost done", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <OpenInExternalBrowser
        externalBrowserUrl={EXTERNAL_BROWSER_URL}
        fallbackSignInUrl={FALLBACK_SIGN_IN_URL}
      />
    );

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    expect(screen.getByText("1")).toBeInTheDocument();

    await user.click(
      screen.getByRole("link", { name: "Continuar en tu navegador" })
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(browserNavigation.navigateToUrl).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(browserNavigation.navigateToUrl).toHaveBeenCalledWith(
      FALLBACK_SIGN_IN_URL
    );
  });

  it("does not navigate to the fallback when the page is no longer visible", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });

    render(
      <OpenInExternalBrowser
        externalBrowserUrl={EXTERNAL_BROWSER_URL}
        fallbackSignInUrl={FALLBACK_SIGN_IN_URL}
      />
    );

    await user.click(
      screen.getByRole("link", { name: "Continuar en tu navegador" })
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(browserNavigation.navigateToUrl).not.toHaveBeenCalled();
  });
});
