/** @vitest-environment jsdom */
/** Exercises current owned request refresh through the real route and UI, with only its own transport port controlled. @module admission-request-visible-refresh-tests */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionContainer } from "@/app/(admission)/admissions/[slug]/admission-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";

const requestId = "c4f7a662-a180-46d2-8f3d-46c0cab27e91";
const viewerId = "synthetic-own-refresh-viewer";
const router = { back: vi.fn(), bfcacheId: "own-request-refresh", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;

/** @param props - Actual application UI and native router context. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }
/** @returns A genuine public pending request and the route's own browser port. */
function fixture() {
  const request: AdmissionRequestDto = { id: requestId, status: "pending", version: 1, submittedAt: "2026-10-16T12:00:00Z", expiresAt: "2100-11-06T12:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "p•••@example.test", evidenceKind: "declared" } };
  const state: Extract<AdmissionPageState, { kind: "ready" }> = { kind: "ready", viewerId, renderedAt: "2026-10-16T12:00:00Z", request, overview: { tribe: { slug: "own-refresh", name: "Academia de prueba", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, isOpen: true, version: 1 }, state: "pending", nextAction: "view_request", safeMessage: "La solicitud está pendiente de revisión.", request } };
  const client = { viewer: vi.fn<AdmissionBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })), overview: vi.fn<AdmissionBrowserClient["overview"]>(async () => ({ status: "ready", value: state.overview })), own: vi.fn<AdmissionBrowserClient["own"]>(async () => ({ status: "ready", value: request })), operation: vi.fn<AdmissionBrowserClient["operation"]>(), submit: vi.fn<AdmissionBrowserClient["submit"]>(), cancel: vi.fn<AdmissionBrowserClient["cancel"]>() } satisfies AdmissionBrowserClient;
  return { state, request, client };
}
/** @param milliseconds - Elapsed focused browser time. */
async function advance(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }

beforeEach(() => {
  window.localStorage.clear(); vi.clearAllMocks(); vi.useFakeTimers();
  // JSDOM cannot become the foreground browser tab; the real lifecycle listeners remain active.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("visible own admission request", () => {
  it("should show an external resolution after fifteen seconds and stop terminal polling without a route refresh", async () => {
    const test = fixture();
    test.client.own.mockResolvedValue({ status: "ready", value: { ...test.request, status: "cancelled", version: 2 } });
    await act(async () => { render(<AdmissionContainer initialState={test.state} requestPage client={test.client} />, { wrapper: Providers }); });
    expect(within(screen.getByRole("region", { name: "Estado de tu solicitud" })).getByText("La solicitud está pendiente de revisión.")).toBeVisible();
    await advance(15000);
    expect(within(screen.getByRole("region", { name: "Estado de tu solicitud" })).getByText("La solicitud fue cancelada.")).toBeVisible();
    expect(screen.queryByText("La solicitud está pendiente de revisión.")).not.toBeInTheDocument();
    expect(test.client.own).toHaveBeenCalledTimes(1);
    await advance(45000);
    expect(test.client.own).toHaveBeenCalledTimes(1);
    expect(test.client.submit).not.toHaveBeenCalled();
    expect(test.client.cancel).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should preserve confirmed state with a warning on failure and clear only that warning after recovery", async () => {
    const test = fixture();
    test.client.own.mockResolvedValueOnce({ status: "failed", code: "resource_unavailable", message: "Synthetic private diagnostic", uncertain: false });
    await act(async () => { render(<AdmissionContainer initialState={test.state} requestPage client={test.client} />, { wrapper: Providers }); });
    await advance(15000);
    expect(within(screen.getByRole("region", { name: "Estado de tu solicitud" })).getByText("La solicitud está pendiente de revisión.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Conservamos lo último confirmado");
    expect(screen.queryByText("Synthetic private diagnostic")).not.toBeInTheDocument();
    await advance(15000);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Estado de tu solicitud" })).getByText("La solicitud está pendiente de revisión.")).toBeVisible();
  });

  it("should preserve the user's cancellation confirmation and focus during an equal background snapshot", async () => {
    const test = fixture();
    await act(async () => { render(<AdmissionContainer initialState={test.state} requestPage client={test.client} />, { wrapper: Providers }); });
    const confirmation = screen.getByRole("checkbox");
    act(() => { confirmation.focus(); fireEvent.click(confirmation); });
    expect(confirmation).toBeChecked();
    await advance(15000);
    expect(test.client.own).toHaveBeenCalledTimes(1);
    expect(confirmation).toBeChecked();
    expect(confirmation).toHaveFocus();
    expect(test.client.cancel).not.toHaveBeenCalled();
  });

  it("should remove an earlier manual read error after recovering the current request automatically", async () => {
    const test = fixture();
    test.client.own.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: ADMISSION_UI_COPY.readFailed, uncertain: false });
    await act(async () => { render(<AdmissionContainer initialState={test.state} requestPage client={test.client} />, { wrapper: Providers }); });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.read })));
    expect(screen.getByRole("alert")).toHaveTextContent(ADMISSION_UI_COPY.readFailed);
    await advance(15000);
    expect(test.client.own).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(test.client.cancel).not.toHaveBeenCalled();
  });

  it("should retain a cancellation failure after a successful automatic read", async () => {
    const test = fixture();
    const message = "No pudimos cancelar la solicitud. Revisá su estado antes de volver a intentarlo.";
    test.client.cancel.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message, uncertain: false });
    await act(async () => { render(<AdmissionContainer initialState={test.state} requestPage client={test.client} />, { wrapper: Providers }); });
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.cancel })));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    await advance(15000);
    expect(test.client.own).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(test.client.cancel).toHaveBeenCalledTimes(1);
  });

  it("should reject another request's reply while retaining its own original state", async () => {
    const test = fixture();
    test.client.own.mockResolvedValue({ status: "ready", value: { ...test.request, id: "5d0dcba5-9cd4-4fb4-8328-cdf2c850defd", status: "cancelled", version: 2 } });
    await act(async () => { render(<AdmissionContainer initialState={test.state} requestPage client={test.client} />, { wrapper: Providers }); });
    await advance(15000);
    expect(within(screen.getByRole("region", { name: "Estado de tu solicitud" })).getByText("La solicitud está pendiente de revisión.")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Estado de tu solicitud" })).queryByText("La solicitud fue cancelada.")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Conservamos lo último confirmado");
  });
});
