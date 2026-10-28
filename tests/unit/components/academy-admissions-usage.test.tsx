/** Exercises safe aggregate/history presentation and the real minimal guardian surface. @module academy-admissions-usage-tests */
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { AdmissionMetrics } from "@/components/academy-admissions/admission-metrics";
import { AdmissionActivity } from "@/components/academy-admissions/admission-activity";
import { MessagingConnections, type MessagingConnectionsProps } from "@/components/academy-admissions/messaging-connections";
import { createAdmissionActivityPageFixture } from "@/tests/support/admission-activity-page";
import { createAdmissionActivityFilterDraft } from "@/src/modules/academy-admissions/application/commands/admission-activity-filter-draft";

const router = { back: vi.fn(), bfcacheId: "activity-presentation-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** @param props - Test children. @returns Actual shared UI and framework routing, without component-library mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

describe("admission usage and historical presentation", () => {
  it("should distinguish daily consumption, delivery states and external attempts without personal aggregate labels", () => {
    const state = createAdmissionActivityPageFixture();
    state.metrics.attempts.accepted = 3;
    const view = render(<AdmissionMetrics metrics={state.metrics} currentUsage={state.currentUsage} usageHref="/synthetic-academy/academia/admissions/messaging" />, { wrapper: Providers });
    // 20:00 UTC is shown in Argentina time.
    expect(screen.getByText("14 oct 2026 · 17:00", { selector: "time" })).toBeInTheDocument();
    expect(screen.getByText("Códigos consumidos").closest("div")).toHaveTextContent("8");
    expect(screen.getByText("Aceptadas").closest("div")).toHaveTextContent("1");
    expect(screen.getByText("Aceptados").closest("div")).toHaveTextContent("3");
    expect(screen.getByText(/no representan un saldo ni una garantía monetaria/)).toBeInTheDocument();
    expect(view.container.textContent.includes(state.viewerId)).toBe(false);
    expect(view.container.textContent.includes(state.tribeId)).toBe(false);
    expect(screen.getByRole("link", { name: "Administrar países y cupos" })).toHaveAttribute("href", "/synthetic-academy/academia/admissions/messaging");
  });

  it("should retain observed consumption and identify a different policy version without calling it current", () => {
    const state = createAdmissionActivityPageFixture();
    state.metrics.usage.policyVersion = 5;
    render(<AdmissionMetrics metrics={state.metrics} currentUsage={state.currentUsage} usageHref="/usage" />, { wrapper: Providers });
    expect(screen.getByRole("status")).toHaveTextContent("La configuración cambió entre las consultas");
    expect(screen.getByText(/Configuración consultada: versión 6/)).toBeInTheDocument();
    expect(screen.getByText("Cupo de códigos de la versión consultada")).toBeInTheDocument();
    expect(screen.getByText("Códigos consumidos").closest("div")).toHaveTextContent("8");
    expect(state.currentUsage.policy?.version).toBe(6);
  });

  it("should warn when the maintenance driver has not run for more than ten minutes and stay quiet while it is current", () => {
    const state = createAdmissionActivityPageFixture(), asOf = new Date(state.metrics.asOf).getTime();
    state.metrics.lastSuccessfulRun = { operation: "messaging_dispatch", at: new Date(asOf - 11 * 60_000).toISOString() };
    const view = render(<AdmissionMetrics metrics={state.metrics} currentUsage={{ state: "not_configured", policy: null }} usageHref="/usage" />, { wrapper: Providers });
    expect(screen.getByRole("alert")).toHaveTextContent(/El mantenimiento no completa una ejecución desde hace/);

    view.rerender(<AdmissionMetrics metrics={{ ...state.metrics, lastSuccessfulRun: { operation: "messaging_dispatch", at: new Date(asOf - 60_000).toISOString() } }} currentUsage={{ state: "not_configured", policy: null }} usageHref="/usage" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("should warn when recent loose phases hide a maintenance that has not completed a run for more than ten minutes", () => {
    const state = createAdmissionActivityPageFixture(), asOf = new Date(state.metrics.asOf).getTime();
    state.metrics.lastSuccessfulRun = { operation: "messaging_dispatch", at: new Date(asOf - 60_000).toISOString() };
    state.metrics.maintenance = { lastCompletedAt: new Date(asOf - 12 * 60_000).toISOString() };
    const view = render(<AdmissionMetrics metrics={state.metrics} currentUsage={{ state: "not_configured", policy: null }} usageHref="/usage" />, { wrapper: Providers });
    expect(screen.getByRole("alert")).toHaveTextContent(/El mantenimiento no completa una ejecución desde hace 720 s/);
    expect(screen.getByText(/Última ejecución completa del mantenimiento/)).toBeInTheDocument();

    view.rerender(<AdmissionMetrics metrics={{ ...state.metrics, maintenance: { lastCompletedAt: null } }} currentUsage={{ state: "not_configured", policy: null }} usageHref="/usage" />);
    expect(screen.getByRole("alert")).toHaveTextContent("El mantenimiento todavía no completó ninguna ejecución.");

    view.rerender(<AdmissionMetrics metrics={{ ...state.metrics, maintenance: { lastCompletedAt: new Date(asOf - 2 * 60_000).toISOString() } }} currentUsage={{ state: "not_configured", policy: null }} usageHref="/usage" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("should explain absent worker observations and unconfigured usage without inventing zero historical consumption", () => {
    const state = createAdmissionActivityPageFixture();
    state.metrics.lastSuccessfulRun = null; state.metrics.durations = []; state.metrics.errors = [];
    state.metrics.usage.policyVersion = null;
    render(<AdmissionMetrics metrics={state.metrics} currentUsage={{ state: "not_configured", policy: null }} usageHref="/usage" />, { wrapper: Providers });
    expect(screen.getByText("Todavía no hay una ejecución exitosa registrada.")).toBeInTheDocument();
    expect(screen.getByText("No hay muestras de duración registradas.")).toBeInTheDocument();
    expect(screen.getByText("Códigos consumidos").closest("div")).toHaveTextContent("8");
    expect(screen.queryByText("Cupo actual de códigos")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should expose the original actor, rule, version and safe changes only within the scoped history", () => {
    const state = createAdmissionActivityPageFixture(), apply = vi.fn(), older = vi.fn();
    state.activity.nextCursor = `${state.activity.items[0].createdAt}|${state.activity.items[0].id}`;
    render(<AdmissionActivity page={state.activity} selection={state.selection} draft={createAdmissionActivityFilterDraft(state.selection)} busy={false} validationMessage={null} onChange={vi.fn()} onApply={apply} onOlder={older} />, { wrapper: Providers });
    const summary = screen.getByText("Cambio de países y cupos").closest("summary");
    if (!summary) throw new Error("The historical detail has no native disclosure control");
    fireEvent.click(summary);
    expect(summary.parentElement).toHaveAttribute("open");
    expect(screen.getByText("Versión histórica").closest("div")).toHaveTextContent("2");
    expect(screen.getByText("Actor").closest("div")).toHaveTextContent(state.viewerId);
    expect(screen.getByText("Regla aplicada").closest("div")).toHaveTextContent("update_messaging_usage");
    expect(screen.getByText("Cupo diario de códigos").closest("div")).toHaveTextContent("50");
    fireEvent.click(screen.getByRole("button", { name: "Ver actividad anterior" }));
    expect(older).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  it("should render only a guardian operational alert even if leader-only form props are present", () => {
    const marker = randomUUID();
    const props: MessagingConnectionsProps = {
      configuration: { audience: "guardian", operationalAlert: "attention_required" }, name: marker, apiKey: randomUUID(),
      confirmed: true, busy: false, canSave: true, validationConfirmed: true, canValidate: true, fieldErrors: {},
      onNameChange: vi.fn(), onApiKeyChange: vi.fn(), onConfirmationChange: vi.fn(), onValidationConfirmationChange: vi.fn(), onValidate: vi.fn(), onSave: vi.fn(),
    };
    const view = render(<MessagingConnections {...props} />, { wrapper: Providers });
    expect(within(screen.getByRole("region", { name: "Estado de mensajería" })).getByRole("status")).not.toBeEmptyDOMElement();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(view.container.textContent.includes(marker)).toBe(false);
    expect(view.container.textContent.includes(props.apiKey)).toBe(false);
  });
});
