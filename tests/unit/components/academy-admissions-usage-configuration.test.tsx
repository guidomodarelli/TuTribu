/** Exercises the guided usage presentation with real shared controls and only own event ports. @module academy-admissions-usage-configuration-tests */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { MessagingUsage, type MessagingUsageProps } from "@/components/academy-admissions/messaging-usage";
import type { MessagingUsagePolicyDto } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { describeMessagingUsageChangeImpact } from "@/src/modules/messaging/application/results/messaging-usage-change-impact";

const router = { back: vi.fn(), bfcacheId: "usage-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
const countriesStep = 0, verificationStep = 1, notificationStep = 2, reviewStep = 3;
/** Actual shared UI and framework composition remain in use. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }
/** @returns A saved configuration with explicit limits and today's consumption. */
function savedPolicy(overrides: Partial<MessagingUsagePolicyDto> = {}): MessagingUsagePolicyDto {
  return { version: 2, allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200, platformMaximums: { verificationDailyLimit: 500, notificationDailyLimit: 2000 }, consumption: { verificationToday: 3, notificationToday: 2 }, ...overrides };
}
/** Provides an unconfigured usage owner on its first step without a key, connection or admission policy. */
function fixture(): MessagingUsageProps {
  return { state: { state: "not_configured", policy: null }, draft: { allowedCountries: [], verificationDailyLimit: "100", notificationDailyLimit: "200" }, countryChoices: [{ value: "AR", label: "Argentina" }, { value: "US", label: "Estados Unidos" }],
    editing: true, step: countriesStep, confirmed: false, busy: false, saving: false, progressMessage: null, canEdit: true, validationMessage: null, errorMessage: null, statusMessage: null,
    onChange: vi.fn(), onConfirm: vi.fn(), onStepChange: vi.fn(), onStartEditing: vi.fn(), onCancelEditing: vi.fn(), onSave: vi.fn(), onReloadCurrent: vi.fn() };
}
/** @param props - Fixture to configure in place. @param draft - Proposed values compared with the saved policy. */
function configure(props: MessagingUsageProps, policy: MessagingUsagePolicyDto, draft: { allowedCountries: string[]; verificationDailyLimit: number; notificationDailyLimit: number }) {
  props.state = { state: "configured", policy };
  props.draft = { allowedCountries: draft.allowedCountries, verificationDailyLimit: String(draft.verificationDailyLimit), notificationDailyLimit: String(draft.notificationDailyLimit) };
  props.impact = describeMessagingUsageChangeImpact(policy, draft);
}

beforeEach(() => vi.clearAllMocks());
describe("guided messaging usage presenter", () => {
  it("should explain the UTC budget and provider billing without implying a fixed monetary balance", () => {
    render(<MessagingUsage {...fixture()} />, { wrapper: Providers });
    expect(screen.getByText(/día.*UTC/i)).toBeInTheDocument();
    expect(screen.getByText(/proveedor.*factura.*cuenta.*líder/i)).toBeInTheDocument();
    expect(screen.getByText(/cupos.*no.*garantía.*monetaria/i)).toBeInTheDocument();
  });

  it("should open the countries step first when nothing is configured and advance only through its own callback", () => {
    const props = fixture();
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByText(/Todavía no hay países ni cupos guardados/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paso 1 de 4" })).toBeInTheDocument();
    expect(screen.getByText("Elegí a qué países se pueden enviar códigos y avisos por SMS.")).toBeInTheDocument();
    expect(screen.getByText(/países que tu academia no atiende/)).toBeInTheDocument();
    expect(screen.getByText("Sin países elegidos no se envía ningún código ni aviso por SMS.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar países y cupos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(props.onStepChange).toHaveBeenCalledWith(verificationStep);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("should remove a chosen country from the draft without saving", () => {
    const props = fixture(); props.draft.allowedCountries = ["AR", "US"];
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Estados Unidos" }));
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, allowedCountries: ["AR"] });
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("should show the verification quota with its platform maximum and block continuing with an invalid number", () => {
    const props = fixture(); configure(props, savedPolicy(), { allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200 }); props.editing = true; props.step = verificationStep;
    const view = render(<MessagingUsage {...props} />, { wrapper: Providers });
    const input = screen.getByRole("spinbutton", { name: "Códigos por día" });
    expect(input).toHaveValue(100); expect(input).toHaveAttribute("max", "500");
    expect(screen.getByText(/Podés elegir de 0 a 500, el máximo de la plataforma. Hoy ya se enviaron 3./)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "0" } });
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, verificationDailyLimit: "0" });
    props.draft = { ...props.draft, verificationDailyLimit: "501" }; view.rerender(<MessagingUsage {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ingresá un número entero entre 0 y 500.");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.getByText("Corregí el número para continuar.")).toBeInTheDocument();
  });

  it("should explain a zero notice quota and suggest the platform default without forcing it", () => {
    const props = fixture(); props.step = notificationStep; props.draft.notificationDailyLimit = "0";
    const view = render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByText("Con 0 no se envía ningún aviso por correo o SMS.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Avisos por día" })).toHaveAccessibleDescription(/Con 0 no se envía ningún aviso por correo o SMS/);
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Usar 200" }));
    expect(props.onChange).toHaveBeenCalledWith({ ...props.draft, notificationDailyLimit: "200" });
    props.draft = { ...props.draft, notificationDailyLimit: "1" }; view.rerender(<MessagingUsage {...props} />);
    expect(screen.getByText(/Es un cupo muy bajo: con 1 aviso por día/)).toBeInTheDocument();
    props.draft = { ...props.draft, notificationDailyLimit: "200" }; view.rerender(<MessagingUsage {...props} />);
    expect(screen.queryByText(/cupo muy bajo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar 200" })).not.toBeInTheDocument();
  });

  it("should compare an increased quota, require the increase confirmation and only then run the final save", () => {
    const props = fixture(); configure(props, savedPolicy(), { allowedCountries: ["AR", "US"], verificationDailyLimit: 150, notificationDailyLimit: 200 }); props.step = reviewStep;
    const view = render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByText("De 100 a 150")).toBeInTheDocument();
    expect(screen.getByText("Argentina, Estados Unidos")).toBeInTheDocument();
    expect(screen.getByText("Países que se agregan: Estados Unidos.")).toBeInTheDocument();
    const confirmation = screen.getByRole("checkbox", { name: "Revisé los países y cupos y confirmo el aumento indicado." });
    expect(confirmation).not.toBeChecked();
    const save = screen.getByRole("button", { name: "Guardar países y cupos" });
    expect(save).toBeDisabled(); expect(screen.getByText("Marcá la confirmación para guardar.")).toBeInTheDocument();
    fireEvent.click(confirmation); expect(props.onConfirm).toHaveBeenCalledWith(true);
    props.confirmed = true; view.rerender(<MessagingUsage {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar países y cupos" }));
    expect(props.onSave).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should not offer saving an unchanged configuration", () => {
    const props = fixture(); configure(props, savedPolicy(), { allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200 }); props.step = reviewStep; props.confirmed = true;
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByText("Todavía no cambiaste ningún país ni cupo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar países y cupos" })).toBeDisabled();
  });

  it("should keep the final label while saving and announce the current sub-step", () => {
    const props = fixture(); props.step = reviewStep; props.confirmed = true; props.busy = true; props.saving = true; props.canEdit = false; props.progressMessage = "Creando la configuración…";
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByText(/primero se crea la configuración y enseguida se guarda lo que elegiste/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: /Guardar países y cupos/ });
    expect(save).toHaveAttribute("aria-busy", "true"); expect(save).toBeEnabled();
    expect(screen.getByText("Creando la configuración…")).toHaveAttribute("role", "status");
    expect(screen.queryByText("Procesando…")).not.toBeInTheDocument();
  });

  it("should summarize the saved configuration with usage meters and open the steps only on request", () => {
    const props = fixture(); props.editing = false; props.state = { state: "configured", policy: savedPolicy({ notificationDailyLimit: 0 }) };
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getAllByRole("group", { name: /Códigos de hoy/ })[0]).toHaveTextContent("Códigos enviados");
    expect(screen.queryByRole("group", { name: /Avisos de hoy/ })).not.toBeInTheDocument();
    expect(screen.getByText("Avisos de hoy: cupo en cero; con 0 no se envía ningún aviso por correo o SMS.")).toBeInTheDocument();
    expect(screen.getByText(/3 códigos y 2 avisos consumidos hoy/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Pasos para guardar países y cupos" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar países y cupos" }));
    expect(props.onStartEditing).toHaveBeenCalledOnce(); expect(props.onSave).not.toHaveBeenCalled();
  });

  it("should warn about a very low saved notice quota in the summary", () => {
    const props = fixture(); props.editing = false; props.state = { state: "configured", policy: savedPolicy({ notificationDailyLimit: 1 }) };
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByText(/Es un cupo muy bajo: con 1 aviso por día/)).toBeInTheDocument();
  });

  it("should say the configuration was created with defaults and offer a retry when the chosen values were not saved", () => {
    const props = fixture(); configure(props, savedPolicy({ version: 1, allowedCountries: [] }), { allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 1 }); props.step = reviewStep; props.confirmed = true;
    props.partialMessage = "La configuración se creó con los valores iniciales, pero todavía falta guardar lo que elegiste."; props.errorMessage = "No pudimos guardar el uso."; props.canRetrySave = true;
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("todavía falta guardar lo que elegiste"); expect(alert).toHaveTextContent("No pudimos guardar el uso.");
    expect(screen.queryByText("Los países y cupos quedaron guardados.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado" }));
    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it("should keep conflict feedback and the draft until the explicit current-read callback is used", () => {
    const props = fixture(); props.draft.allowedCountries = ["US"]; props.errorMessage = "Los países o cupos cambiaron. Revisalos y volvé a confirmar.";
    render(<MessagingUsage {...props} />, { wrapper: Providers });
    expect(screen.getByRole("alert")).toHaveTextContent("Los países o cupos cambiaron");
    expect(screen.getByRole("button", { name: "Quitar Estados Unidos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar uso actual" }));
    expect(props.onReloadCurrent).toHaveBeenCalledOnce(); expect(props.onSave).not.toHaveBeenCalled();
  });
});
