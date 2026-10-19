import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useRouter } from "next/navigation";

import { AppRailShell } from "@/components/app-rail/app-rail-shell";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

const pushMock = vi.fn();
const refreshMock = vi.fn();

/** Wide enough to keep the sidebar beside the page. */
const DESKTOP_SHELL_WIDTH_PX = 1280;
/** Narrow enough for the navigation sheet. */
const PHONE_SHELL_WIDTH_PX = 375;

const member: AuthenticatedMemberResult = {
  avatarFallback: "GH",
  email: "grace@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "tribemate",
};

function buildTribe(overrides: Partial<MemberTribeListItemResult> = {}): MemberTribeListItemResult {
  return {
    logoUrl: null,
    membershipStatus: "active",
    name: "Matematica Pro",
    role: "tribemate",
    slug: "matematica-pro",
    tribeId: "tribe-1",
    ...overrides,
  };
}

function setShellWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
}

function renderShell({
  authenticatedMember = member,
  defaultOpen,
  memberTribes = [],
}: {
  authenticatedMember?: AuthenticatedMemberResult | null;
  defaultOpen?: boolean;
  memberTribes?: MemberTribeListItemResult[];
} = {}) {
  return render(
    <AppRailShell
      authenticatedMember={authenticatedMember}
      defaultOpen={defaultOpen}
      memberTribes={memberTribes}
      headerActions={<input aria-label="Buscar" />}
    >
      <p>Contenido</p>
    </AppRailShell>
  );
}

function getSidebarNavigation() {
  return screen.getAllByRole("navigation", { name: "Navegación principal" })[0];
}

function getTrail() {
  return within(screen.getByRole("navigation", { name: "Ruta de navegación" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("AppRailShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setShellWidth(DESKTOP_SHELL_WIDTH_PX);
    document.cookie = "sidebar_state=; max-age=0; path=/";
    (useRouter as Mock).mockReturnValue({ push: pushMock, refresh: refreshMock });
    (usePathname as Mock).mockReturnValue("/");
  });

  afterEach(() => {
    setShellWidth(0);
  });

  it("lists the member tribes under create and discover outside a tribe", async () => {
    const user = userEvent.setup();

    renderShell({ memberTribes: [buildTribe({ name: "Alpha Club", slug: "alpha-club" })] });

    const rows = within(getSidebarNavigation()).getAllByRole("button");

    expect(rows.map((row) => row.textContent)).toEqual(["Nueva tribu", "Descubrir tribus", "Alpha Club"]);
    expect(screen.getByRole("button", { name: "Descubrir tribus" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("group", { name: "Tribus" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Alpha Club" }));

    expect(pushMock).toHaveBeenCalledWith("/alpha-club");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows an empty state when the member has no tribes", () => {
    renderShell();

    expect(screen.getByText("Todavía no formas parte de ninguna tribu")).toBeInTheDocument();
  });

  it("shows the signed-in member at the foot of the sidebar", () => {
    renderShell();

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Tu cuenta")).toBeInTheDocument();
  });

  it("leaves the profile out for visitors", () => {
    renderShell({ authenticatedMember: null });

    expect(screen.queryByText("Tu cuenta")).not.toBeInTheDocument();
    expect(screen.queryByText("Todavía no formas parte de ninguna tribu")).not.toBeInTheDocument();
  });

  it("shows the tribe sections and marks the open one inside a tribe", async () => {
    const user = userEvent.setup();
    (usePathname as Mock).mockReturnValue("/matematica-pro/eventos");

    renderShell({ memberTribes: [buildTribe()] });

    const rows = within(getSidebarNavigation()).getAllByRole("button");

    expect(rows.map((row) => row.textContent)).toEqual([
      "Fogón",
      "Bienvenida",
      "Eventos",
      "Cursos",
      "La tribu",
      "MéritosPronto",
      "Historia",
    ]);
    expect(screen.getByRole("button", { name: "Eventos" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("group", { name: "Gestión" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cursos" }));

    expect(pushMock).toHaveBeenCalledWith("/matematica-pro/cursos");
  });

  it("adds the management group for leaders and keeps settings for them only", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro");

    const { unmount } = renderShell({ memberTribes: [buildTribe({ role: "leader" })] });
    const leaderGroup = screen.getByRole("group", { name: "Gestión" });

    expect(within(leaderGroup).getAllByRole("button").map((row) => row.textContent)).toEqual([
      "Invitaciones",
      "Precios",
      "Canales",
      "Ajustes",
    ]);

    unmount();
    renderShell({ memberTribes: [buildTribe({ role: "guardian" })] });

    expect(
      within(screen.getByRole("group", { name: "Gestión" })).queryByRole("button", { name: "Ajustes" })
    ).not.toBeInTheDocument();
  });

  it("shows a basic academy member only the sections they can open", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro/academia");

    renderShell({
      memberTribes: [buildTribe({ accessModel: "academy", hasCommunityAccess: false })],
    });

    expect(within(getSidebarNavigation()).getAllByRole("button").map((row) => row.textContent)).toEqual([
      "Academia",
      "Bienvenida",
      "Cursos",
      "Historia",
    ]);
  });

  it("names the tribe, the group and the open section in the breadcrumb", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro/invitaciones/metricas");

    renderShell({ memberTribes: [buildTribe({ role: "leader" })] });

    expect(getTrail()).toEqual(["Matematica Pro", "Gestión", "Invitaciones"]);
  });

  it("opens the admissions group on an admission page and marks the open subsection", async () => {
    const user = userEvent.setup();
    (usePathname as Mock).mockReturnValue("/matematica-pro/academia/admissions/settings");

    renderShell({ memberTribes: [buildTribe({ accessModel: "academy", role: "leader" })] });

    const group = screen.getByRole("button", { name: "Admisiones" });
    expect(group).toHaveAttribute("aria-expanded", "true");
    const subsections = screen.getByRole("list", { name: "Admisiones" });
    expect(within(subsections).getAllByRole("button").map((row) => row.textContent)).toEqual([
      "Solicitudes",
      "Reglas",
      "Habilitados",
      "Invitaciones",
      "Países y cupos",
      "Conexión",
      "Avisos",
      "Actividad",
    ]);
    expect(within(subsections).getByRole("button", { name: "Reglas" })).toHaveAttribute("aria-current", "page");
    expect(getTrail()).toEqual(["Matematica Pro", "Admisiones", "Reglas"]);

    await user.click(within(subsections).getByRole("button", { name: "Países y cupos" }));
    expect(pushMock).toHaveBeenCalledWith("/matematica-pro/academia/admissions/messaging");

    await user.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
  });

  it("gives guardians only the review subsections and keeps the request history under the inbox", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro/academia/admissions/history/request-1");

    renderShell({ memberTribes: [buildTribe({ accessModel: "academy", role: "guardian" })] });

    const subsections = screen.getByRole("list", { name: "Admisiones" });
    expect(within(subsections).getAllByRole("button").map((row) => row.textContent)).toEqual(["Solicitudes", "Avisos"]);
    expect(within(subsections).getByRole("button", { name: "Solicitudes" })).toHaveAttribute("aria-current", "page");
  });

  it("leaves the admissions group out of classic tribes", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro");

    renderShell({ memberTribes: [buildTribe({ role: "leader" })] });

    expect(screen.queryByRole("button", { name: "Admisiones" })).not.toBeInTheDocument();
  });

  it("leaves the tribe as the current step on routes outside the sidebar", () => {
    (usePathname as Mock).mockReturnValue("/matematica-pro/suscripcion");

    renderShell({ memberTribes: [buildTribe()] });

    expect(getTrail()).toEqual(["Matematica Pro"]);
    expect(screen.getByText("Matematica Pro", { selector: "li" })).toHaveAttribute("aria-current", "page");
  });

  it("folds the sidebar into the rail, announces it and remembers it", async () => {
    const user = userEvent.setup();

    renderShell();

    const toggle = screen.getByRole("button", { name: "Contraer barra lateral" });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-keyshortcuts", "[");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Barra lateral contraída");
    expect(document.cookie).toContain("sidebar_state=false");
    expect(screen.getByRole("group", { name: "Tribus" }).querySelector("[data-visible]")).toHaveAttribute(
      "data-visible",
      "true"
    );
  });

  it("starts on the rail when the cookie says it was folded", () => {
    renderShell({ defaultOpen: false });

    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles the rail with the [ key outside text fields", async () => {
    const user = userEvent.setup();

    renderShell();

    await user.keyboard("[[");

    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toBeInTheDocument();

    await user.click(screen.getByRole("textbox", { name: "Buscar" }));
    await user.keyboard("[[");

    expect(screen.getByRole("textbox", { name: "Buscar" })).toHaveValue("[");
    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toBeInTheDocument();
  });

  it("accepts [ typed with AltGr but not as a Ctrl shortcut", async () => {
    const user = userEvent.setup();

    renderShell();

    await user.keyboard("{Control>}[[{/Control}");

    expect(screen.getByRole("button", { name: "Contraer barra lateral" })).toBeInTheDocument();

    // Spanish layouts type [ with AltGr, which browsers report as Ctrl+Alt.
    await user.keyboard("{Control>}{Alt>}[[{/Alt}{/Control}");

    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toBeInTheDocument();
  });

  it("opens the navigation sheet on narrow screens and closes it after picking a row", async () => {
    const user = userEvent.setup();
    setShellWidth(PHONE_SHELL_WIDTH_PX);

    renderShell({ memberTribes: [buildTribe({ name: "Alpha Club", slug: "alpha-club" })] });

    const menuButton = screen.getByRole("button", { name: "Abrir navegación" });

    expect(menuButton).toHaveAttribute("aria-haspopup", "dialog");

    await user.click(menuButton);

    const sheet = await screen.findByRole("dialog", { name: "Navegación" });

    await user.click(within(sheet).getByRole("button", { name: "Alpha Club" }));

    expect(pushMock).toHaveBeenCalledWith("/alpha-club");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
