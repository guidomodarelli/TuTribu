/** Exercises the guided policy presenter with real shared controls/providers and owned callbacks only. @module academy-admission-policy-tests */
import { fireEvent, render, screen, within } from "@testing-library/react";
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

/** Supplies current internal DTO/draft and feature-owned event ports for a saved, not activated draft. */
function fixture(): AdmissionPolicyFormProps {
  const policy = { id: "83ecbfaf-0e7c-4afb-aefc-62b62800d367", version: 1, verificationEpoch: 1, mode: "manual_review" as const, contactType: "email" as const, isOpen: true, allowCommonExceptions: false, requiresAdditionalVerification: false, requiresWhatsappNumber: false, phoneChannel: null, allowSmsAlternative: false, activatedAt: null, messagingConnectionId: null, messagingConnectionVersion: null, usage: null, requirements: [] };
  const draft = { mode: policy.mode, contactType: policy.contactType, isOpen: policy.isOpen, allowCommonExceptions: policy.allowCommonExceptions, requiresAdditionalVerification: policy.requiresAdditionalVerification, requiresWhatsappNumber: false, phoneChannel: policy.phoneChannel, allowSmsAlternative: policy.allowSmsAlternative, messagingConnectionId: policy.messagingConnectionId, messagingConnectionVersion: policy.messagingConnectionVersion };
  return {
    state: { state: "draft", controlActivated: false, policy, usage: null, preparation: { state: "not_evaluated", requirements: [] }, impact: { pendingRequestCount: 3, contactTypeLocked: false, historicalLinksProtected: false, warnings: [] } },
    draft, savedRules: draft, editing: false, step: 0, confirmed: false, busy: false, stage: null, pendingAction: null,
    validationMessage: null, statusMessage: null, errorMessage: null, failure: null, activationBlock: null, permissionDenied: false,
    links: { usage: "/synthetic-academy/academia/admissions/messaging", connection: "/synthetic-academy/academia/admissions/messaging/connections", allowlist: "/synthetic-academy/academia/admissions/allowlist", academy: "/synthetic-academy/academia/gestionar" },
    pauseOpen: false, pauseReason: "", uncertain: false, canRetryOriginal: false, retryConfirmed: false,
    onChange: vi.fn(), onStepChange: vi.fn(), onConfirm: vi.fn(), onRunFinal: vi.fn(), onEdit: vi.fn(), onCancelEdit: vi.fn(), onPauseOpen: vi.fn(), onPauseReason: vi.fn(), onPause: vi.fn(), onResume: vi.fn(),
    onRetry: vi.fn(), onReloadCurrent: vi.fn(), onRetryConfirm: vi.fn(), onRetryOriginal: vi.fn(),
    onReviewDraft: vi.fn(), onReviewCommercial: vi.fn(), onRecheck: vi.fn(),
  };
}

/** @param props - Fixture to turn into an activated control. @param isOpen - Whether new requests are received. @returns The same fixture with an activated open or paused state. */
function activated(props: AdmissionPolicyFormProps, isOpen: boolean): AdmissionPolicyFormProps {
  const policy = { ...props.state.policy!, isOpen, activatedAt: "2026-10-07T09:00:00Z" };
  return { ...props, savedRules: { ...props.savedRules, isOpen }, draft: { ...props.draft, isOpen }, state: { ...props.state, state: isOpen ? "active" : "paused", controlActivated: true, policy, impact: { ...props.state.impact, contactTypeLocked: true, historicalLinksProtected: true } } };
}

describe("guided policy presentation", () => {
  it("should explain that a saved draft is not active yet and ask one decision per step", () => {
    const props = fixture();
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    const summary = screen.getByRole("region", { name: "Estado actual" });
    expect(summary).toHaveTextContent("Admisiones sin activar");
    expect(summary).toHaveTextContent("3 solicitudes pendientes");
    const notice = within(summary).getByRole("group", { name: "Tenés reglas guardadas sin publicar" });
    expect(notice).toHaveTextContent("Las admisiones todavía no reciben solicitudes. Revisá lo que guardaste y activalas.");
    fireEvent.click(within(notice).getByRole("button", { name: "Revisar y activar" }));
    expect(props.onReviewDraft).toHaveBeenCalledOnce();
    expect(screen.getByRole("navigation", { name: "Paso 1 de 4" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Revisión manual" })).toBeChecked();
    expect(screen.getByText("Cada persona envía una solicitud y vos decidís si la aprobás o la rechazás.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Permitir solicitudes comunes como excepción" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Lista de habilitados" }));
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, mode: "allowlist" });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(props.onStepChange).toHaveBeenCalledWith(1);
    expect(props.onRunFinal).not.toHaveBeenCalled();
  });

  it("should offer exceptions and the allowlist page only for the allowlist mode", () => {
    const props = fixture(); props.draft = { ...props.draft, mode: "allowlist" };
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    fireEvent.click(screen.getByRole("checkbox", { name: "Permitir solicitudes comunes como excepción" }));
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, allowCommonExceptions: true });
    expect(screen.getByRole("link", { name: "Cargar personas en Habilitados" })).toHaveAttribute("href", props.links.allowlist);
  });

  it("should edit contact choices without enabling codes, notices or a provider", () => {
    const props = fixture(); props.step = 1;
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("group", { name: "Cómo se contactan" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Exigir el teléfono del solicitante" }));
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, requiresWhatsappNumber: true });
    fireEvent.click(screen.getByRole("checkbox", { name: "Comprobar el contacto con un código" }));
    expect(props.onChange).toHaveBeenLastCalledWith({ ...props.draft, requiresAdditionalVerification: true });
    expect(props.onRunFinal).not.toHaveBeenCalled();
  });

  it("should block the contact step with a clear reason when a phone allowlist has no code", () => {
    const props = fixture(); props.step = 1; props.draft = { ...props.draft, mode: "allowlist", contactType: "phone" }; props.validationMessage = "La lista por teléfono requiere comprobar el contacto con un código.";
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByText(props.validationMessage)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.getByText(/invitaciones personales por teléfono no están disponibles/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurar países y cupos de mensajería" })).toHaveAttribute("href", props.links.usage);
  });

  it("should require a phone code channel before continuing", () => {
    const props = fixture(); props.step = 1; props.draft = { ...props.draft, contactType: "phone", requiresAdditionalVerification: true };
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByText("Elegí el canal para enviar el código por teléfono.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("should explain that intake is open by default and what unchecking it means", () => {
    const props = fixture(); props.step = 2;
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("checkbox", { name: "Recibir nuevas solicitudes" })).toBeChecked();
    expect(screen.getByText(/nadie puede postularse hasta que las reanudes/)).toBeInTheDocument();
  });

  it("should summarize the choices and keep the single final action closed until confirmed", () => {
    const props = fixture(); props.step = 3; props.draft = { ...props.draft, mode: "allowlist", allowCommonExceptions: true };
    const view = render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByText("Lista de habilitados, con solicitudes de excepción")).toBeInTheDocument();
    expect(screen.getByText("Se reciben")).toBeInTheDocument();
    expect(screen.getByText(/3 solicitudes pendientes conservan su fecha/)).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText("Marcá la confirmación para continuar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar y activar admisiones" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Revisé las reglas y quiero activar las admisiones." }));
    expect(props.onConfirm).toHaveBeenCalledWith(true);
    view.rerender(<AdmissionPolicyForm {...props} confirmed />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar y activar admisiones" }));
    expect(props.onRunFinal).toHaveBeenCalledOnce();
  });

  it("should show the running sub-step and a loading final action without changing its label", () => {
    const props = fixture(); props.step = 3; props.confirmed = true; props.busy = true; props.stage = "checking"; props.pendingAction = "final";
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    const final = screen.getByRole("button", { name: "Guardar y activar admisiones" });
    expect(final).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Revisando los requisitos…")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Atrás" })).toBeDisabled();
    expect(screen.queryByText(/sólo está disponible para el líder activo/)).not.toBeInTheDocument();
  });

  it("should explain each missing requirement with the page that resolves it", () => {
    const props = fixture(); props.step = 3;
    props.activationBlock = { message: "Todavía falta un requisito para activar las admisiones.", note: "Tus reglas quedaron guardadas como borrador.", preflightReasons: [], requirements: ["verification_unavailable", "recipient_countries_not_configured", "phone_channel_required"], unknownCommercialMemberCount: 2, privilegedCommercialMemberCount: 0 };
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    const block = screen.getByRole("region", { name: "Lo que falta resolver" });
    expect(within(block).getByRole("alert")).toHaveTextContent("Todavía falta un requisito para activar las admisiones.");
    expect(within(block).getByRole("link", { name: "Ir a Conexión" })).toHaveAttribute("href", props.links.connection);
    expect(within(block).getByRole("link", { name: "Ir a Países y cupos" })).toHaveAttribute("href", props.links.usage);
    expect(block).toHaveTextContent("Membresías bloqueadas por pago sin revisar: 2.");
    expect(within(block).queryByRole("group", { name: "Depende del equipo de TuTribu" })).not.toBeInTheDocument();
    expect(block).not.toHaveTextContent("verification_unavailable");
    fireEvent.click(within(block).getByRole("button", { name: "Revisar «Cómo se contactan»" }));
    expect(props.onStepChange).toHaveBeenCalledWith(1);
  });

  it("should say what was already done when a chained step fails and retry from there", () => {
    const props = fixture(); props.step = 3; props.errorMessage = "La mensajería no está disponible temporalmente."; props.failure = { stage: "activating", rulesSaved: true };
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos activar las admisiones. La mensajería no está disponible temporalmente.");
    expect(screen.getByRole("alert")).toHaveTextContent("Las reglas ya quedaron guardadas como borrador.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it("should show the leader-only notice only for an actual permission denial", () => {
    const props = fixture(); props.busy = true;
    const view = render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.queryByText(/sólo está disponible para el líder activo/)).not.toBeInTheDocument();
    view.rerender(<AdmissionPolicyForm {...props} busy={false} errorMessage="No pudimos completar la operación." />);
    expect(screen.queryByText(/sólo está disponible para el líder activo/)).not.toBeInTheDocument();
    view.rerender(<AdmissionPolicyForm {...props} busy={false} permissionDenied />);
    expect(screen.getByText("La configuración sólo está disponible para el líder activo de esta academia.")).toHaveAttribute("role", "alert");
  });

  it("should show an open control as a simple status with pause and edit", () => {
    const props = activated(fixture(), true);
    const view = render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("heading", { name: "Admisiones abiertas" })).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reanudar admisiones" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pausar admisiones" }));
    expect(props.onPauseOpen).toHaveBeenCalledWith(true);
    view.rerender(<AdmissionPolicyForm {...props} pauseOpen />);
    expect(screen.getByRole("button", { name: "Confirmar pausa" })).toBeDisabled();
    view.rerender(<AdmissionPolicyForm {...props} pauseOpen pauseReason="Cierre de cohorte" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar pausa" }));
    expect(props.onPause).toHaveBeenCalledOnce();
    view.rerender(<AdmissionPolicyForm {...props} pauseOpen pauseReason="Cierre de cohorte" busy stage="pausing" pendingAction="pause" />);
    expect(screen.getByRole("button", { name: "Confirmar pausa" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Pausando las admisiones…")).toBeInTheDocument();
  });

  it("should offer resume for a paused control and open the rules flow to edit", () => {
    const props = activated(fixture(), false);
    const view = render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("heading", { name: "Admisiones pausadas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reanudar admisiones" }));
    expect(props.onResume).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Editar reglas" }));
    expect(props.onEdit).toHaveBeenCalledOnce();
    view.rerender(<AdmissionPolicyForm {...props} editing step={2} confirmed />);
    expect(screen.getByRole("navigation", { name: "Paso 3 de 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.queryByText(/Guardá el borrador y volvé a revisar/)).not.toBeInTheDocument();
    view.rerender(<AdmissionPolicyForm {...props} editing step={1} />);
    expect(screen.getByRole("radio", { name: "Teléfono" })).toBeDisabled();
    expect(screen.getByText("El tipo de contacto quedó fijado al activar el control.")).toBeInTheDocument();
  });

  it("should explain platform blocks with a copyable diagnostic code, a recheck and a report fallback, without offering to publish", async () => {
    const props = fixture(); props.step = 3; props.platformBlocked = true;
    props.activationBlock = { message: "Todavía falta un requisito para activar las admisiones.", note: "Tus reglas quedaron guardadas como borrador.", preflightReasons: ["preflight_evaluator_disabled", "preflight_runtime_unavailable"], requirements: ["admission_recovery_locked"], unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 };
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    const platform = screen.getByRole("group", { name: "Depende del equipo de TuTribu" });
    expect(platform).toHaveTextContent("Esto no es algo que puedas cambiar desde tu academia. Lo que ya elegiste quedó guardado como borrador.");
    expect(platform).toHaveTextContent("La plataforma todavía no habilitó la admisión para esta academia.");
    expect(platform).toHaveTextContent("La plataforma todavía no preparó todos los recorridos de admisión.");
    expect(platform).toHaveTextContent("La plataforma pausó las admisiones mientras recupera un servicio.");
    expect(platform).toHaveTextContent("Código de diagnóstico: preflight_evaluator_disabled");
    expect(within(platform).getByRole("button", { name: "Copiar código preflight_runtime_unavailable" })).toBeEnabled();
    fireEvent.click(within(platform).getByRole("button", { name: "Volver a comprobar" }));
    expect(props.onRecheck).toHaveBeenCalledOnce();
    fireEvent.click(within(platform).getByRole("button", { name: "Reportar el problema" }));
    expect(await within(platform).findByRole("status")).toHaveTextContent("No pudimos abrir el reporte. Escribile al equipo de TuTribu e incluí el código de diagnóstico.");
    const notice = screen.getByRole("group", { name: "Tenés reglas guardadas sin publicar" });
    expect(notice).toHaveTextContent("Por ahora no se pueden activar: depende del equipo de TuTribu.");
    expect(within(notice).queryByRole("button", { name: "Revisar y activar" })).not.toBeInTheDocument();
  });

  it("should send academy, scope and commercial blocks to the place that resolves them", () => {
    const props = fixture(); props.step = 3;
    props.activationBlock = { message: "Todavía falta un requisito para activar las admisiones.", note: "Tus reglas quedaron guardadas como borrador.", preflightReasons: ["preflight_academy_unavailable", "preflight_scope_mismatch", "preflight_unknown_commercial_history", "preflight_privileged_commercial_membership"], requirements: ["admission_clock_invalid"], unknownCommercialMemberCount: 1, privilegedCommercialMemberCount: 1 };
    render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    const block = screen.getByRole("region", { name: "Lo que falta resolver" });
    expect(block).toHaveTextContent("Primero hay que activar el modo academia en esta tribu.");
    expect(within(block).getByRole("link", { name: "Ir a Gestionar academia" })).toHaveAttribute("href", props.links.academy);
    expect(within(block).getAllByRole("button", { name: "Volver a comprobar" })).toHaveLength(1);
    fireEvent.click(within(block).getByRole("button", { name: "Volver a comprobar" }));
    expect(props.onRecheck).toHaveBeenCalledOnce();
    expect(block).toHaveTextContent("Hay membresías bloqueadas por pago de las que no sabemos si estaban activas o silenciadas.");
    expect(block).toHaveTextContent("Hay guardianes bloqueados por pago. Decidí si vuelven como integrantes, sin su rol, o si quedan retirados.");
    expect(block).toHaveTextContent("Guardianes bloqueados por pago: 1.");
    expect(within(block).getAllByRole("button", { name: "Revisar membresías bloqueadas por pago" })).toHaveLength(1);
    fireEvent.click(within(block).getByRole("button", { name: "Revisar membresías bloqueadas por pago" }));
    expect(props.onReviewCommercial).toHaveBeenCalledOnce();
    expect(within(block).queryByRole("group", { name: "Depende del equipo de TuTribu" })).not.toBeInTheDocument();
  });

  it("should insert the membership review before the final step and keep Continue closed while decisions are pending", () => {
    const props = fixture(); props.step = 3; props.membershipStep = { content: <p>Contenido de la revisión</p>, blockedReason: "Decidí qué pasa con cada membresía antes de continuar." };
    const view = render(<AdmissionPolicyForm {...props} />, { wrapper: Providers });
    expect(screen.getByRole("navigation", { name: "Paso 4 de 5" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Revisá membresías bloqueadas por pago" })).toHaveTextContent("Contenido de la revisión");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.getByText("Decidí qué pasa con cada membresía antes de continuar.")).toBeInTheDocument();
    view.rerender(<AdmissionPolicyForm {...props} step={4} confirmed finalLabel="Activar ahora" membershipStep={{ content: null, blockedReason: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Activar ahora" }));
    expect(props.onRunFinal).toHaveBeenCalledOnce();
  });
});
