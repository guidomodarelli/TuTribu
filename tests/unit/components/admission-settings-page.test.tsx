/** Exercises the shared admissions layout frame and page content with the real UI provider, links and route contexts. @module admission-settings-page-tests */
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it, vi } from "vitest";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { AdmissionWorkspaceRoute, buildAdmissionMemberTribe } from "@/tests/support/admission-workspace-route";
import { ADMISSION_PAGES } from "@/src/modules/academy-admissions/constants/admission-sections";

const router = { back: vi.fn(), bfcacheId: "synthetic-admission-frame", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;

/** @param props - Content rendered inside the application's own providers. @returns The real provider tree used by the platform. */
function Providers({ children }: { children: ReactNode }) {
  return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>;
}

/** @returns The visible names, targets and current state of each admission section link. */
function readSections() {
  return within(screen.getByRole("navigation", { name: "Secciones de admisión" })).getAllByRole("link").map((link) => ({ name: link.textContent, href: link.getAttribute("href"), current: link.getAttribute("aria-current") }));
}

describe("admissions layout frame", () => {
  it("should give a leader every admission section with the open one marked as the current page", () => {
    render(<AdmissionWorkspaceRoute pathname="/mi%20tribu/academia/admissions/settings" slug="mi tribu" memberTribes={[buildAdmissionMemberTribe({ slug: "mi tribu" })]}><p>Contenido</p></AdmissionWorkspaceRoute>, { wrapper: Providers });

    const region = screen.getByRole("region", { name: ADMISSION_PAGES.policy.title });
    expect(within(region).getByRole("heading", { level: 1, name: ADMISSION_PAGES.policy.title })).toBeVisible();
    expect(within(region).getByText(ADMISSION_PAGES.policy.description)).toBeVisible();
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

  it("should limit a guardian to the review sections and keep the request history and the CSV import under their sections", () => {
    const view = render(<AdmissionWorkspaceRoute pathname="/tribu/academia/admissions/history/request-1" slug="tribu" memberTribes={[buildAdmissionMemberTribe({ role: "guardian" })]}><p>Contenido</p></AdmissionWorkspaceRoute>, { wrapper: Providers });

    expect(screen.getByRole("heading", { level: 1, name: ADMISSION_PAGES.history.title })).toBeVisible();
    expect(readSections().map(({ name, current }) => ({ name, current }))).toEqual([{ name: "Solicitudes", current: "page" }, { name: "Avisos", current: null }]);

    view.rerender(<AdmissionWorkspaceRoute pathname="/tribu/academia/admissions/allowlist/imports" slug="tribu" memberTribes={[buildAdmissionMemberTribe()]}><p>Contenido</p></AdmissionWorkspaceRoute>);
    expect(screen.getByRole("heading", { level: 1, name: ADMISSION_PAGES.allowlistImport.title })).toBeVisible();
    expect(readSections().find(({ current }) => current === "page")?.name).toBe("Habilitados");
  });

  it("should keep the heading but offer no navigation to someone who is not a member of the tribe", () => {
    render(<AdmissionWorkspaceRoute pathname="/tribu/academia/admissions/invitations" slug="tribu"><p>No disponible</p></AdmissionWorkspaceRoute>, { wrapper: Providers });

    expect(screen.getByRole("heading", { level: 1, name: ADMISSION_PAGES.invitations.title })).toBeVisible();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("should keep related actions apart from the section navigation", () => {
    render(<AdmissionSettingsPage links={[{ href: "/tribu/academia/admissions/allowlist/imports", label: "Importar habilitados desde CSV" }]}><p>Contenido</p></AdmissionSettingsPage>, { wrapper: Providers });

    const related = screen.getByRole("navigation", { name: "Acciones relacionadas" });
    expect(within(related).getByRole("link", { name: "Importar habilitados desde CSV" })).toHaveAttribute("href", "/tribu/academia/admissions/allowlist/imports");
  });
});
