import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactElement } from "react";

import { AppRailShell } from "@/components/app-rail/app-rail-shell";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";

// The shared setup reports reduced motion, which makes every exit instant. This file turns motion back on
// before Motion reads the preference, so the breadcrumb's exit really plays.
vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
});

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

/** Wide enough to keep the sidebar beside the page. */
const DESKTOP_SHELL_WIDTH_PX = 1280;
/** Longer than the shell's post-mount settle, after which motion is no longer instant. */
const SHELL_SETTLE_WAIT_MS = 250;

const tribe: MemberTribeListItemResult = {
  logoUrl: null,
  membershipStatus: "active",
  name: "Matematica Pro",
  role: "tribemate",
  slug: "matematica-pro",
  tribeId: "tribe-1",
};

/** Renders the shell on a route; the page content names the route so a new one always re-renders the shell. */
function renderOn(pathname: string, rerender?: (ui: ReactElement) => void) {
  (usePathname as Mock).mockReturnValue(pathname);
  // The app loads Motion's features once at the root; without them `m` elements cannot animate at all.
  const ui = (
    <LazyMotion features={domMax}>
      <AppRailShell authenticatedMember={null} memberTribes={[tribe]} headerActions={null}>
        <p>{pathname}</p>
      </AppRailShell>
    </LazyMotion>
  );
  if (rerender) {
    rerender(ui);
    return rerender;
  }
  return render(ui).rerender;
}

function getBreadcrumb() {
  return within(screen.getByRole("navigation", { name: "Ruta de navegación" }));
}

describe("AppRailShell breadcrumb motion", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => DESKTOP_SHELL_WIDTH_PX });
    (useRouter as Mock).mockReturnValue({ push: vi.fn(), refresh: vi.fn() });
  });

  it("plays the open section's exit before dropping it from the breadcrumb", async () => {
    const rerender = renderOn("/matematica-pro/eventos");
    await act(() => new Promise((resolve) => setTimeout(resolve, SHELL_SETTLE_WAIT_MS)));

    renderOn("/matematica-pro/suscripcion", rerender);

    // Still mounted while it leaves, and only the tribe claims the current page.
    const leaving = getBreadcrumb().getByText("Eventos").closest("li");
    expect(leaving).not.toBeNull();
    expect(leaving).not.toHaveAttribute("aria-current");
    expect(getBreadcrumb().getByText("Matematica Pro")).toHaveAttribute("aria-current", "page");

    await waitFor(() => expect(getBreadcrumb().queryByText("Eventos")).not.toBeInTheDocument());
    expect(getBreadcrumb().getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Matematica Pro"]);
  });
});
