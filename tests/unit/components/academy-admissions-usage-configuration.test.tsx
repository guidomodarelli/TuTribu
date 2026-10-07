/** Exercises early usage presentation with real shared controls and only own event ports. @module academy-admissions-usage-configuration-tests */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { MessagingUsage, type MessagingUsageProps } from "@/components/academy-admissions/messaging-usage";

const router = { back: vi.fn(), bfcacheId: "usage-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Actual shared UI and framework composition remain in use. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }
/** Provides current usage and editable strings without a key, connection or admission policy. */
function fixture(): MessagingUsageProps {
  return { state: { state: "not_configured", policy: null }, draft: { allowedCountries: [], verificationDailyLimit: "100", notificationDailyLimit: "200" }, countryChoices: [{ value: "AR", label: "Argentina" }, { value: "US", label: "Estados Unidos" }], confirmed: false, busy: false, canEdit: true, validationMessage: null, errorMessage: null, statusMessage: null,
    onChange: vi.fn(), onConfirm: vi.fn(), onInitialize: vi.fn(), onSave: vi.fn(), onReloadCurrent: vi.fn() };
}

beforeEach(() => vi.clearAllMocks());
describe("early messaging usage presenter", () => {
  it("should show unpersisted defaults and require explicit confirmation before initializing without a connection", () => {
    const props = fixture(); const view = render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByText(/todavía no está configurado/)).toBeInTheDocument();
    expect(screen.getByText(/no habilitan envíos telefónicos/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Códigos por día" })).toHaveValue(100);
    expect(screen.getByRole("spinbutton", { name: "Avisos por día" })).toHaveValue(200);
    expect(screen.getByRole("button", { name: "Iniciar configuración de uso" })).toBeDisabled();
    props.confirmed = true; view.rerender(<MessagingUsage {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar configuración de uso" }));
    expect(props.onInitialize).toHaveBeenCalledOnce(); expect(props.onSave).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should display only saved countries as enabled while leaving the proposed countries in the draft", () => {
    const props = fixture(); props.state = { state: "configured", policy: { version: 4, allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 500, notificationDailyLimit: 2000 }, consumption: { verificationToday: 3, notificationToday: 2 } } }; props.draft.allowedCountries = ["AR", "US"];
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByText("Países guardados: Argentina.")).toBeInTheDocument();
    expect(screen.getByText(/3 códigos y 2 avisos consumidos hoy/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Códigos por día" })).toHaveAttribute("max", "500");
    fireEvent.click(screen.getByRole("button", { name: "Quitar Estados Unidos del borrador" }));
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, allowedCountries: ["AR"] });
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("should preserve zero quotas and block invalid confirmed submission before invoking its writer", () => {
    const props = fixture(); props.confirmed = true; props.validationMessage = "Revisá el límite diario de códigos.";
    props.state = { state: "configured", policy: { version: 1, allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 1000, notificationDailyLimit: 5000 }, consumption: { verificationToday: 0, notificationToday: 0 } } };
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Códigos por día" }), { target: { value: "0" } });
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, verificationDailyLimit: "0" });
    expect(screen.getByRole("alert")).toHaveTextContent("Revisá el límite");
    fireEvent.submit(screen.getByRole("button", { name: "Guardar países y cupos" }).closest("form")!);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("should keep conflict feedback and the draft visible until the explicit current-read callback is used", () => {
    const props = fixture(); props.draft.allowedCountries = ["US"]; props.errorMessage = "Los países o cupos cambiaron. Revisalos y volvé a confirmar.";
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByRole("alert")).toHaveTextContent("Los países o cupos cambiaron");
    expect(screen.getByRole("button", { name: "Quitar Estados Unidos del borrador" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar uso actual" }));
    expect(props.onReloadCurrent).toHaveBeenCalledOnce(); expect(props.onSave).not.toHaveBeenCalled();
  });
});
