/** Exercises the shared admission workspace frame with the real UI provider, links and navigation. @module admission-settings-page-tests */
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it, vi } from "vitest";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { MemberTribesProvider } from "@/components/platform/member-tribes-provider";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { ADMISSION_SECTION, ADMISSION_SECTION_AUDIENCE } from "@/src/modules/academy-admissions/constants/admission-sections";

const router = { back: vi.fn(), bfcacheId: "synthetic-admission-frame", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;

/** @param props - Content rendered inside the application's own providers. @returns The real provider tree used by the platform. */
function Providers({ children }: { children: ReactNode }) {
  return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>;
}

/** @returns The visible names and current state of each admission section link. */
function readSections() {
  return within(screen.getByRole("navigation", { name: "Secciones de admisión" })).getAllByRole("link").map((link) => ({ name: link.textContent, href: link.getAttribute("href"), current: link.getAttribute("aria-current") }));
}

describe("AdmissionSettingsPage", () => {
  it("should give a leader every admission section with the open one marked as the current page", () => {
    render(<AdmissionSettingsPage title="Reglas de admisión" description="Prepará las reglas." section={ADMISSION_SECTION.policy} slug="mi tribu" audience={ADMISSION_SECTION_AUDIENCE.leader}><p>Contenido</p></AdmissionSettingsPage>, { wrapper: Providers });

    const region = screen.getByRole("region", { name: "Reglas de admisión" });
    expect(within(region).getByRole("heading", { level: 1, name: "Reglas de admisión" })).toBeVisible();
    expect(within(region).getByText("Prepará las reglas.")).toBeVisible();
    expect(within(region).getByRole("link", { name: "Gestionar academia" })).toHaveAttribute("href", "/mi%20tribu/academia/gestionar");
    expect(readSections()).toEqual([
      { name: "Solicitudes", href: "/mi%20tribu/academia/admissions", current: null },
      { name: "Reglas", href: "/mi%20tribu/academia/admissions/settings", current: "page" },
      { name: "Habilitados", href: "/mi%20tribu/academia/admissions/allowlist", current: null },
      { name: "Invitaciones", href: "/mi%20tribu/academia/admissions/invitations", current: null },
      { name: "Países y cupos", href: "/mi%20tribu/academia/admissions/messaging", current: null },
      { name: "Conexión", href: "/mi%20tribu/academia/admissions/messaging/connections", current: null },
      { name: "Avisos", href: "/mi%20tribu/academia/admissions/notifications", current: null },
      { name: "Actividad", href: "/mi%20tribu/academia/admissions/activity", current: null },
    ]);
    expect(within(region).getByText("Contenido")).toBeVisible();
  });

  it("should limit a reviewer to the review sections and return them to academy management", () => {
    render(<AdmissionSettingsPage title="Avisos de admisión" section={ADMISSION_SECTION.notifications} slug="tribu" audience={ADMISSION_SECTION_AUDIENCE.reviewer}><p>Contenido</p></AdmissionSettingsPage>, { wrapper: Providers });

    expect(readSections().map(({ name, current }) => ({ name, current }))).toEqual([{ name: "Solicitudes", current: null }, { name: "Avisos", current: "page" }]);
    expect(screen.getByRole("link", { name: "Gestionar academia" })).toHaveAttribute("href", "/tribu/academia/gestionar");
  });

  it("should follow the member's role from the platform layout, as the app rail does, over the page's fallback audience", () => {
    const leaderTribe = { logoUrl: null, membershipStatus: "active", name: "Tribu", role: "leader", slug: "tribu", tribeId: "tribe-1", accessModel: "academy" } satisfies MemberTribeListItemResult;
    const view = render(<MemberTribesProvider memberTribes={[leaderTribe]}><AdmissionSettingsPage title="Solicitudes de ingreso" section={ADMISSION_SECTION.review} slug="tribu" audience={ADMISSION_SECTION_AUDIENCE.reviewer}><p>Contenido</p></AdmissionSettingsPage></MemberTribesProvider>, { wrapper: Providers });

    expect(readSections().map(({ name }) => name)).toEqual(["Solicitudes", "Reglas", "Habilitados", "Invitaciones", "Países y cupos", "Conexión", "Avisos", "Actividad"]);
    expect(readSections()[0].current).toBe("page");

    view.rerender(<MemberTribesProvider memberTribes={[{ ...leaderTribe, role: "guardian" }]}><AdmissionSettingsPage title="Reglas de admisión" section={ADMISSION_SECTION.policy} slug="tribu" audience={ADMISSION_SECTION_AUDIENCE.leader}><p>Contenido</p></AdmissionSettingsPage></MemberTribesProvider>);
    expect(readSections().map(({ name }) => name)).toEqual(["Solicitudes", "Avisos"]);
  });

  it("should keep related actions apart from the section navigation", () => {
    render(<AdmissionSettingsPage title="Lista de habilitados" section={ADMISSION_SECTION.allowlist} slug="tribu" audience={ADMISSION_SECTION_AUDIENCE.leader} links={[{ href: "/tribu/academia/admissions/allowlist/imports", label: "Importar habilitados desde CSV" }]}><p>Contenido</p></AdmissionSettingsPage>, { wrapper: Providers });

    const related = screen.getByRole("navigation", { name: "Acciones relacionadas" });
    expect(within(related).getByRole("link", { name: "Importar habilitados desde CSV" })).toHaveAttribute("href", "/tribu/academia/admissions/allowlist/imports");
  });

  it("should omit navigation while the tribe or the viewer's access is unresolved", () => {
    render(<AdmissionSettingsPage title="Reglas de admisión" section={ADMISSION_SECTION.policy} audience={ADMISSION_SECTION_AUDIENCE.leader}><p>No disponible</p></AdmissionSettingsPage>, { wrapper: Providers });

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Reglas de admisión" })).toBeVisible();
  });
});
