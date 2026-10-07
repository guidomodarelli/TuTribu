/** Exercises the policy presenter with real shared controls/providers and owned callbacks only. @module academy-admission-policy-tests */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { AdmissionPolicyForm, type AdmissionPolicyFormProps } from "@/components/academy-admissions/admission-policy-form";

/** Actual UI provider uses the native router context, without library mocks. */
function Providers({ children }: { children: ReactNode }) {
  const router = { back: vi.fn(), bfcacheId: "policy-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
  return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>;
}

/** Supplies current internal DTO/draft and feature-owned event ports. */
function fixture(): AdmissionPolicyFormProps {
  const policy = { id: "83ecbfaf-0e7c-4afb-aefc-62b62800d367", version: 1, verificationEpoch: 1, mode: "manual_review" as const, contactType: "email" as const, isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: false, phoneChannel: null, allowSmsAlternative: false, activatedAt: null, messagingConnectionId: null, messagingConnectionVersion: null, usage: null, requirements: [] };
  const draft = { mode: policy.mode, contactType: policy.contactType, isOpen: policy.isOpen, allowCommonExceptions: policy.allowCommonExceptions, requiresAdditionalVerification: policy.requiresAdditionalVerification, phoneChannel: policy.phoneChannel, allowSmsAlternative: policy.allowSmsAlternative, messagingConnectionId: policy.messagingConnectionId, messagingConnectionVersion: policy.messagingConnectionVersion };
  return { state: { state: "draft", controlActivated: false, policy, usage: null, preparation: { state: "not_evaluated", requirements: [] }, impact: { pendingRequestCount: 3, contactTypeLocked: false, historicalLinksProtected: false, warnings: [] } }, draft, confirmed: false, canEdit: true, busy: false, errorMessage: null, validationMessage: null, preflightMessage: "La admisión completa todavía no está disponible. Podés preparar un borrador.", activationAvailable: false, pauseReason: "", usageSettingsHref: null,
    onChange: vi.fn(), onConfirm: vi.fn(), onPauseReason: vi.fn(), onInitialize: vi.fn(), onSave: vi.fn(), onActivate: vi.fn(), onPause: vi.fn(), onCheckPreflight: vi.fn(), onReloadCurrent: vi.fn() };
}

describe("policy controlled presentation", () => {
  it("should offer the actual early usage route before an admission policy exists", () => {
    const props = fixture(); props.state = { ...props.state, state: "not_configured", policy: null }; props.usageSettingsHref = "/synthetic-academy/academia/admissions/messaging";
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("link", { name: "Configurar países y cupos de mensajería" })).toHaveAttribute("href", props.usageSettingsHref);
    expect(props.onInitialize).not.toHaveBeenCalled();
  });
  it("should show independent closed defaults, impact and unprotected history without offering an unprepared activation", () => {
    const props = fixture(); render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByText(/todavía no tiene activado el control/)).toBeInTheDocument();
    expect(screen.getByText(/3 solicitudes pendientes conservan su fecha/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Recibir nuevas solicitudes" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Permitir solicitudes comunes como excepción" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Activar control de admisión" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar requisitos de activación" }));
    expect(props.onCheckPreflight).toHaveBeenCalledOnce();
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it("should change verification alone without implying notices, opening or a messaging connection", () => {
    const props = fixture(); render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, requiresAdditionalVerification: true });
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it("should warn for manual phone OFF and lock contact choice only after activation", () => {
    const props = fixture(); props.draft = { ...props.draft, contactType: "phone" }; props.state.policy = { ...props.state.policy!, contactType: "phone" };
    const view = render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByText(/invitaciones personales por teléfono no están disponibles/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Canal del código" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Contacto para el ingreso" })).not.toBeDisabled();
    props.state = { ...props.state, state: "paused", controlActivated: true, policy: { ...props.state.policy!, activatedAt: "2026-10-07T09:00:00Z" }, impact: { ...props.state.impact, contactTypeLocked: true, historicalLinksProtected: true } };
    view.rerender(<AdmissionPolicyForm {...props} />);
    expect(screen.getByRole("combobox", { name: "Contacto para el ingreso" })).toBeDisabled();
    expect(screen.getByText(/tipo de contacto quedó fijado/)).toBeInTheDocument();
  });

  it("should keep the draft visible during conflict and use its explicit reload callback without submitting", () => {
    const props = fixture(); props.errorMessage = "La configuración cambió. Revisala y volvé a confirmar."; props.draft.requiresAdditionalVerification = true;
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("alert")).toHaveTextContent("La configuración cambió");
    expect(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Consultar configuración actual" }));
    expect(props.onReloadCurrent).toHaveBeenCalledOnce();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("should block invalid confirmed actions and show pause for persisted opening independently of an unsaved draft", () => {
    const props = fixture(); props.confirmed = true; props.validationMessage = "Elegí un canal para comprobar el teléfono.";
    const view = render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("alert")).toHaveTextContent("Elegí un canal");
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Guardar borrador" }).closest("form")!);
    expect(props.onSave).not.toHaveBeenCalled();
    props.state.policy = { ...props.state.policy!, isOpen: true };
    view.rerender(<AdmissionPolicyForm {...props} />);
    expect(screen.getByRole("button", { name: "Pausar admisiones" })).toBeDisabled();
    props.pauseReason = "Pausa autorizada"; view.rerender(<AdmissionPolicyForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausar admisiones" }));
    expect(props.onPause).toHaveBeenCalledOnce();
    expect(props.draft.isOpen).toBe(false);
  });
});
