import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OpenInExternalBrowser } from "@/components/subscriptions/open-in-external-browser";
import * as browserNavigation from "@/lib/browser-navigation";

jest.mock("@/lib/browser-navigation", () => ({
  navigateToUrl: jest.fn(),
}));

const EXTERNAL_BROWSER_URL =
  "x-safari-https://tutribu.example.com/matematica-pro?preapproval_id=preapproval-1";
const FALLBACK_SIGN_IN_URL =
  "/auth/signin?callbackUrl=%2Fmatematica-pro%3Fpreapproval_id%3Dpreapproval-1";

describe("OpenInExternalBrowser", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(browserNavigation.navigateToUrl).mockReset();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("renders the handoff copy with the primary action and fallback link", () => {
    render(
      <OpenInExternalBrowser
        externalBrowserUrl={EXTERNAL_BROWSER_URL}
        fallbackSignInUrl={FALLBACK_SIGN_IN_URL}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Abrí TuTribu en tu navegador" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continuar en tu navegador" })
    ).toHaveAttribute("href", EXTERNAL_BROWSER_URL);
    expect(
      screen.getByRole("link", { name: "O continuá con inicio de sesión acá" })
    ).toHaveAttribute("href", FALLBACK_SIGN_IN_URL);
  });

  it("navigates to the sign-in fallback when the deep link does not take the user away", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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

    jest.advanceTimersByTime(2_000);

    expect(browserNavigation.navigateToUrl).toHaveBeenCalledWith(
      FALLBACK_SIGN_IN_URL
    );
  });

  it("does not navigate to the fallback when the page is no longer visible", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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

    jest.advanceTimersByTime(2_000);

    expect(browserNavigation.navigateToUrl).not.toHaveBeenCalled();
  });
});
