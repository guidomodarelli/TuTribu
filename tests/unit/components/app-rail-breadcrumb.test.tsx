import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";

import { AppRailBreadcrumb } from "@/components/app-rail/app-rail-breadcrumb";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

const leaderTribe: MemberTribeListItemResult = {
  logoUrl: null,
  membershipStatus: "active",
  name: "Matematica Pro",
  role: "leader",
  slug: "matematica-pro",
  tribeId: "tribe-1",
};

function getTrail() {
  return within(screen.getByRole("navigation", { name: "Ruta de navegación" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("AppRailBreadcrumb", () => {
  beforeEach(() => {
    (usePathname as Mock).mockReturnValue("/");
  });

  it("shows the active tribe and the current member section", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro/eventos");

    render(<AppRailBreadcrumb memberTribes={[leaderTribe]} />);

    expect(getTrail()).toEqual(["Matematica Pro", "Eventos"]);
    expect(screen.getByText("Eventos").closest("li")).toHaveAttribute("aria-current", "page");
  });

  it("names the management section of a nested admin route", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro/invitaciones/metricas");

    render(<AppRailBreadcrumb memberTribes={[leaderTribe]} />);

    expect(getTrail()).toEqual(["Matematica Pro", "Gestión", "Invitaciones"]);
  });

  it("leaves the tribe as the current step on routes outside the sidebar", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro/suscripcion");

    render(<AppRailBreadcrumb memberTribes={[leaderTribe]} />);

    expect(getTrail()).toEqual(["Matematica Pro"]);
    expect(screen.getByText("Matematica Pro").closest("li")).toHaveAttribute("aria-current", "page");
  });

  it("does not name sections a member cannot see in the sidebar", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro/invitaciones");

    render(<AppRailBreadcrumb memberTribes={[{ ...leaderTribe, role: "tribemate" }]} />);

    expect(getTrail()).toEqual(["Matematica Pro"]);
  });

  it("renders nothing outside the member's tribes", () => {
    (usePathname as Mock).mockReturnValue("/otra-tribu/eventos");

    const { container } = render(<AppRailBreadcrumb memberTribes={[leaderTribe]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
