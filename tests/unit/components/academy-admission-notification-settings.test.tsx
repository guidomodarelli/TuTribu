/** Exercises the guided settings interaction with real shared controls, framework context and owned ports only. @module admission-notification-settings-container-tests */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionNotificationSettingsContainer } from "@/app/(platform)/[slug]/academia/admissions/notifications/notification-settings-container";
import { AdmissionNotificationSettings, type AdmissionNotificationSettingsProps } from "@/components/academy-admissions/admission-notification-settings";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionNotificationSettingsBrowserClient } from "@/src/modules/notifications/application/ports/admission-notification-settings-browser-client";
import type { AdmissionNotificationSettingsPageState } from "@/src/modules/notifications/application/results/admission-notification-settings-page-state";
import { readAdmissionNotificationSettingsIntent, writeAdmissionNotificationSettingsIntent } from "@/lib/academy-admissions/admission-notification-settings-intent";
import { changeGuidedStep } from "@/tests/support/guided-steps";
import { ADMISSION_NOTIFICATION_SETTINGS_COPY } from "@/src/modules/notifications/constants/admission-notification-settings-browser";

const tribeId = "83ecbfaf-0e7c-4afb-aefc-62b62800d367", viewerId = "synthetic-notification-leader", slug = "synthetic-academy";
const originalId = "f5536335-668a-4b6e-a972-f76c95c7c822";
const router = { back: vi.fn(), bfcacheId: "notification-settings-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Uses actual framework and UI providers instead of replacing their modules. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }
/** @returns Only owned current DTOs and controllable application transport ports. */
function fixture() {
  const state: Extract<AdmissionNotificationSettingsPageState, { kind: "ready" }> = { kind: "ready", slug, tribeId, viewerId, preference: { mode: "grouped", version: 0, source: "implicit" }, canConfigureEmail: true, email: { enabled: false, version: 0, timeZone: "America/Argentina/Buenos_Aires" } };
  const client = {
    viewer: vi.fn<AdmissionNotificationSettingsBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    readPreference: vi.fn<AdmissionNotificationSettingsBrowserClient["readPreference"]>(async () => ({ status: "ready", value: { viewerId, data: { preference: state.preference, canConfigureEmail: state.canConfigureEmail } } })),
    changePreference: vi.fn<AdmissionNotificationSettingsBrowserClient["changePreference"]>(async (_slug, input) => ({ status: "ready", value: { viewerId, data: { status: "changed", preference: { mode: input.mode, version: input.expectedVersion + 1, source: "stored" } } } })),
    readEmail: vi.fn<AdmissionNotificationSettingsBrowserClient["readEmail"]>(async () => ({ status: "ready", value: { viewerId, data: state.email! } })),
    changeEmail: vi.fn<AdmissionNotificationSettingsBrowserClient["changeEmail"]>(async (_slug, input) => ({ status: "ready", value: { viewerId, data: { state: "completed", operationId: input.operationId, replayed: false, result: { status: "changed", settings: { enabled: input.enabled, version: input.expectedVersion + 1, timeZone: input.timeZone } } } } })),
    operation: vi.fn<AdmissionNotificationSettingsBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
  };
  return { state, client, node: () => <AdmissionNotificationSettingsContainer initialState={state} client={client} /> };
}
/** Marks every saved fact so the page opens on its summary. */
function settle(data: ReturnType<typeof fixture>) {
  data.state.preference = { mode: "grouped", version: 1, source: "stored" };
  data.state.email = { enabled: true, version: 1, timeZone: "UTC" };
}
/** A synthetic original command kept from an earlier save. */
function original(timeZone = "UTC") { return { operationId: originalId, confirmed: true as const, expectedVersion: 0, enabled: true, timeZone }; }
/** Waits for the real native viewer check before explicit interactions. */
async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "Consultar estado actual" })).not.toBeDisabled()); }
/** Advances one guided step with the real form submit. */
/** Moves to the next step and waits for the previous one to leave. */
async function next() { await changeGuidedStep(screen.getByRole("button", { name: "Continuar" })); }
/** Single review consent; never restored from storage. */
async function confirm() { const checkbox = screen.getByRole("checkbox", { name: "Revisé el resumen y quiero guardar estos avisos." }); await waitFor(() => expect(checkbox).not.toBeDisabled()); fireEvent.click(checkbox); }
/** Runs the final chained save. */
function save() { fireEvent.click(screen.getByRole("button", { name: "Guardar avisos" })); }
/** Uses the actual shared radio group. */
async function choose(label: string) { await userEvent.setup().click(screen.getByRole("radio", { name: new RegExp(`^${label}`) })); }
/** @param name - Review row term. @returns The row's value cell. */
function reviewRow(name: string) { return screen.getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement; }

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("admission notification settings guided workflow", () => {
  it("should keep server and first client markup consistent before resuming a stored original on the review step", async () => {
    const data = fixture(); writeAdmissionNotificationSettingsIntent(viewerId, slug, original("Asia/Kolkata"));
    const tree = <Providers>{data.node()}</Providers>, container = document.createElement("div"), recoverable: unknown[] = [];
    container.innerHTML = renderToString(tree); document.body.append(container);
    expect(within(container).getByRole("checkbox", { name: "Habilitar correo de admisión" })).not.toBeChecked();
    let root: ReturnType<typeof hydrateRoot> | null = null;
    try {
      await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: (error) => recoverable.push(error) }); });
      await waitFor(() => expect(within(container).getByText("Se reintenta el cambio pendiente")).toBeInTheDocument());
      expect(recoverable).toEqual([]);
      expect(within(container).getByText("Revisá y guardá", { selector: "legend" })).toBeInTheDocument();
      expect(within(container).getByText(/Conservamos el cambio original/)).toBeInTheDocument();
      expect(within(container).getByText("Habilitado, zona Asia/Kolkata")).toBeInTheDocument();
      expect(within(container).getByRole("checkbox", { name: "Revisé el resumen y quiero guardar estos avisos." })).not.toBeChecked();
      expect(data.client.changeEmail).not.toHaveBeenCalled();
    } finally { await act(async () => { root?.unmount(); }); container.remove(); }
  });

  it("should open the first step for an unsaved leader without extra reads or writes and recommend grouped by default", async () => {
    const data = fixture(); data.state.preference = { mode: "omitted", version: 0, source: "implicit" };
    render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.getByText("Correo de la tribu", { selector: "legend" })).toBeInTheDocument();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    await next(); expect(screen.getByRole("radio", { name: /^Agrupar cada cinco minutos/ })).toBeChecked();
    expect(data.client.readPreference).not.toHaveBeenCalled(); expect(data.client.readEmail).not.toHaveBeenCalled();
    expect(data.client.changePreference).not.toHaveBeenCalled(); expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should save a member's recommended default directly and show the saved summary", async () => {
    const data = fixture(); data.state.canConfigureEmail = false; data.state.email = null; data.state.preference.mode = "omitted";
    render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.queryByRole("checkbox", { name: "Habilitar correo de admisión" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Agrupar cada cinco minutos/ })).toBeChecked();
    expect(screen.getByText("El correo de admisión lo habilita el líder de la tribu")).toBeInTheDocument();
    save();
    await waitFor(() => expect(screen.getByText("Tus avisos quedaron guardados.")).toBeInTheDocument());
    expect(data.client.changePreference).toHaveBeenCalledWith(slug, { mode: "grouped", expectedVersion: 0 }, expect.any(AbortSignal));
    expect(screen.getByText("Recibís avisos agrupados cada cinco minutos en tu correo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar avisos" })).toBeInTheDocument();
    expect(data.client.changeEmail).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should warn clearly when the person chooses to omit review email", async () => {
    const data = fixture(); data.state.canConfigureEmail = false; data.state.email = null;
    render(data.node(), { wrapper: Providers }); await ready();
    await choose("Omitir correos de revisión");
    expect(screen.getByText("No vas a recibir correos de revisión")).toBeInTheDocument();
    expect(screen.queryByText("El correo de admisión lo habilita el líder de la tribu")).not.toBeInTheDocument();
  });

  it("should chain the tribe email and the preference with a loading button and one announced sub-step each", async () => {
    vi.stubEnv("TZ", "Europe/Madrid");
    const data = fixture(); let finishEmail!: () => void, finishPreference!: () => void;
    data.client.changeEmail.mockImplementationOnce((_slug, input) => new Promise((resolve) => {
      expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(input);
      finishEmail = () => resolve({ status: "ready", value: { viewerId, data: { state: "completed", operationId: input.operationId, replayed: false, result: { status: "changed", settings: { enabled: input.enabled, version: 1, timeZone: input.timeZone } } } } });
    }));
    data.client.changePreference.mockImplementationOnce((_slug, input) => new Promise((resolve) => { finishPreference = () => resolve({ status: "ready", value: { viewerId, data: { status: "changed", preference: { mode: input.mode, version: 1, source: "stored" } } } }); }));
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" }));
    expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("Europe/Madrid");
    await next(); await choose("Resumen diario"); await next();
    expect(reviewRow("Correo de la tribu")).toHaveTextContent("Habilitado, zona Europe/Madrid"); expect(reviewRow("Correo de la tribu")).toHaveTextContent("Se guarda");
    expect(reviewRow("Tus avisos")).toHaveTextContent("Resumen diario"); expect(screen.getByRole("button", { name: "Guardar avisos" })).toBeDisabled();
    await confirm(); save();
    await waitFor(() => expect(screen.getByText("Guardando el correo de la tribu…")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Guardar avisos" })).toHaveAttribute("aria-busy", "true"); expect(data.client.changePreference).not.toHaveBeenCalled();
    await act(async () => { finishEmail(); });
    await waitFor(() => expect(screen.getByText("Guardando tu preferencia…")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Guardar avisos" })).toHaveAttribute("aria-busy", "true");
    expect(data.client.changePreference).toHaveBeenCalledWith(slug, { mode: "daily", expectedVersion: 0 }, expect.any(AbortSignal));
    await act(async () => { finishPreference(); });
    await waitFor(() => expect(screen.getByText("Tus avisos quedaron guardados.")).toBeInTheDocument());
    expect(data.client.changeEmail.mock.calls[0][1]).toMatchObject({ enabled: true, timeZone: "Europe/Madrid", confirmed: true, expectedVersion: 0 });
    expect(screen.getByText("Recibís un resumen diario a las 09:00, en la zona horaria de la tribu.")).toBeInTheDocument();
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should open on the saved summary and write only the preference that changed", async () => {
    const data = fixture(); settle(data);
    render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.getByText("Recibís avisos agrupados cada cinco minutos en tu correo.")).toBeInTheDocument();
    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar avisos" })); await next(); await choose("Un correo por aviso");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument(); await next();
    expect(reviewRow("Correo de la tribu")).toHaveTextContent("Sin cambios"); expect(reviewRow("Tus avisos")).toHaveTextContent("Se guarda");
    await confirm(); save();
    await waitFor(() => expect(screen.getByText("Tus avisos quedaron guardados.")).toBeInTheDocument());
    expect(data.client.changeEmail).not.toHaveBeenCalled();
    expect(data.client.changePreference).toHaveBeenCalledWith(slug, { mode: "individual", expectedVersion: 1 }, expect.any(AbortSignal));
  });

  it("should block an empty review and discard unsaved edits on cancel", async () => {
    const data = fixture(); settle(data);
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar avisos" })); await next(); await next();
    expect(screen.getByText("No hay cambios para guardar.")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Guardar avisos" })).toBeDisabled();
    await changeGuidedStep(screen.getByRole("button", { name: "Atrás" })); await choose("Resumen diario");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Recibís avisos agrupados cada cinco minutos en tu correo.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar avisos" })); await next();
    expect(screen.getByRole("radio", { name: /^Agrupar cada cinco minutos/ })).toBeChecked();
    expect(data.client.changePreference).not.toHaveBeenCalled();
  });

  it("should report what stayed saved and retry only the pending preference", async () => {
    const data = fixture(); data.client.changePreference.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos guardar tu preferencia ahora.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos guardar tu preferencia ahora."));
    expect(screen.getByText("El correo de la tribu quedó guardado. Falta guardar tu preferencia.")).toBeInTheDocument();
    expect(reviewRow("Correo de la tribu")).toHaveTextContent("Sin cambios"); expect(reviewRow("Tus avisos")).toHaveTextContent("Se guarda");
    await confirm(); save();
    await waitFor(() => expect(screen.getByText("Tus avisos quedaron guardados.")).toBeInTheDocument());
    expect(data.client.changeEmail).toHaveBeenCalledOnce(); expect(data.client.changePreference).toHaveBeenCalledTimes(2);
  });

  it("should keep an uncertain email original and resend it with the same operation id after a read and fresh consent", async () => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "Respuesta no disponible.", uncertain: true });
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.getByText("Tu preferencia todavía no se guardó.")).toBeInTheDocument());
    const sent = data.client.changeEmail.mock.calls[0][1]; await ready();
    expect(data.client.changePreference).not.toHaveBeenCalled(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(sent);
    expect(screen.getByText("Consultá el estado actual antes de guardar otro cambio.")).toBeInTheDocument();
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { state: "started", operationId: sent.operationId } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(screen.getByRole("alert")).toHaveTextContent("El cambio sigue pendiente."); expect(reviewRow("Correo de la tribu")).toHaveTextContent("Se reintenta el cambio pendiente");
    await confirm(); save();
    await waitFor(() => expect(screen.getByText("Tus avisos quedaron guardados.")).toBeInTheDocument());
    expect(data.client.changeEmail.mock.calls.map((call) => call[1])).toEqual([sent, sent]);
    expect(data.client.changePreference).toHaveBeenCalledOnce(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull();
  });

  it("should resync an untouched frequency on read but keep a chosen one through a conflict", async () => {
    const data = fixture(); settle(data);
    data.client.readPreference.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { preference: { mode: "individual", version: 2, source: "stored" }, canConfigureEmail: true } } });
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(screen.getByText("Recibís un correo por cada aviso de revisión.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar avisos" })); await next();
    expect(screen.getByRole("radio", { name: /^Un correo por aviso/ })).toBeChecked();
    data.client.changePreference.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { status: "rejected", reason: "notification_preference_version_conflict" } } });
    data.client.readPreference.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { preference: { mode: "grouped", version: 3, source: "stored" }, canConfigureEmail: true } } });
    await choose("Resumen diario"); await next(); await confirm(); save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Tu preferencia cambió en otra ventana."));
    expect(screen.getByRole("button", { name: "Guardar avisos" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(reviewRow("Tus avisos")).toHaveTextContent("Resumen diario"); await confirm(); save();
    await waitFor(() => expect(data.client.changePreference).toHaveBeenCalledTimes(2));
    expect(data.client.changePreference.mock.calls[1][1]).toEqual({ mode: "daily", expectedVersion: 3 }); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should query a lost personal reply before another write without inventing a durable operation UUID", async () => {
    const data = fixture(); data.state.canConfigureEmail = false; data.state.email = null;
    data.client.changePreference.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "Respuesta no disponible.", uncertain: true });
    render(data.node(), { wrapper: Providers }); await ready(); save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No confirmamos si se guardó tu preferencia."));
    expect(screen.getByRole("button", { name: "Guardar avisos" })).toBeDisabled(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(data.client.changePreference).toHaveBeenCalledOnce(); expect(data.client.readPreference).toHaveBeenCalledOnce(); expect(data.client.operation).not.toHaveBeenCalled();
  });

  it("should preserve an old privileged intent without blocking the current member's own frequency", async () => {
    const data = fixture(); data.state.canConfigureEmail = false; data.state.email = null; data.state.preference.mode = "omitted";
    writeAdmissionNotificationSettingsIntent(viewerId, slug, original());
    render(data.node(), { wrapper: Providers }); await ready(); save();
    await waitFor(() => expect(data.client.changePreference).toHaveBeenCalledOnce());
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original()); expect(data.client.operation).not.toHaveBeenCalled(); expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should show the tribe email step when a member becomes the current leader after a read", async () => {
    const data = fixture(); data.state.canConfigureEmail = false; data.state.email = null;
    render(data.node(), { wrapper: Providers }); await ready();
    data.client.readPreference.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { preference: { mode: "omitted", version: 1, source: "stored" }, canConfigureEmail: true } } });
    data.client.readEmail.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { enabled: true, version: 2, timeZone: "UTC" } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })).toBeChecked(); expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("UTC");
    expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should block the first step on a blank time zone and never suggest over a typed zone", async () => {
    vi.stubEnv("TZ", "Europe/Madrid");
    const data = fixture(); render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" }));
    fireEvent.change(screen.getByLabelText("Zona horaria de la tribu"), { target: { value: " " } });
    expect(screen.getByText("Indicá una zona horaria para continuar.")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Zona horaria de la tribu"), { target: { value: "Asia/Kolkata" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" }));
    expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("Asia/Kolkata"); expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should catch a mistyped time zone next to its field before the leader can continue", async () => {
    const data = fixture(); render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" }));
    const zone = screen.getByLabelText("Zona horaria de la tribu");
    fireEvent.change(zone, { target: { value: "America/Buenos_Aires_Ciudad" } });
    expect(zone).toHaveAttribute("aria-invalid", "true");
    // Announced once, next to the field; the step only points back to it.
    expect(screen.getAllByText(ADMISSION_NOTIFICATION_SETTINGS_COPY.zoneUnknown)).toHaveLength(1);
    expect(screen.getByText(ADMISSION_NOTIFICATION_SETTINGS_COPY.zoneUnknown)).toHaveAttribute("role", "alert");
    expect(screen.getByText(ADMISSION_NOTIFICATION_SETTINGS_COPY.zoneFix)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();

    fireEvent.change(zone, { target: { value: "America/Argentina/Buenos_Aires" } });
    expect(zone).not.toHaveAttribute("aria-invalid");
    // The error row leaves through its exit animation.
    await waitFor(() => expect(screen.queryByText(ADMISSION_NOTIFICATION_SETTINGS_COPY.zoneUnknown)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it.each(["permission_denied", "resource_unavailable", "authentication_required"] as const)("should hide private settings after a personal write loses current authority with %s", async (code) => {
    const data = fixture(); data.client.changePreference.mockResolvedValueOnce({ status: "failed", code, message: "El acceso actual no permite cambiar los avisos.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready(); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.queryByRole("form", { name: "Configurar avisos de admisión" })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("El acceso actual no permite cambiar los avisos."); expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each(["permission_denied", "resource_unavailable", "authentication_required"] as const)("should hide private settings and preserve the exact sent email original after %s", async (code) => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code, message: "El liderazgo actual no permite cambiar el correo.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.queryByRole("form", { name: "Configurar avisos de admisión" })).not.toBeInTheDocument());
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(data.client.changeEmail.mock.calls[0][1]);
    expect(screen.getByRole("alert")).toHaveTextContent("El liderazgo actual no permite cambiar el correo.");
    expect(data.client.changePreference).not.toHaveBeenCalled(); expect(data.client.operation).not.toHaveBeenCalled();
  });

  it("should recover only the current member's preference after a denied leader write without reading or erasing its original", async () => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "El liderazgo actual no permite cambiar el correo.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.queryByRole("form", { name: "Configurar avisos de admisión" })).not.toBeInTheDocument());
    const sent = data.client.changeEmail.mock.calls[0][1];
    data.client.readPreference.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { preference: { mode: "omitted", version: 1, source: "stored" }, canConfigureEmail: false } } });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); await ready();
    expect(screen.getByRole("heading", { name: "Cómo querés recibir los avisos" })).toBeInTheDocument(); expect(screen.queryByRole("checkbox", { name: "Habilitar correo de admisión" })).not.toBeInTheDocument();
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(sent); expect(data.client.operation).not.toHaveBeenCalled(); expect(data.client.readEmail).not.toHaveBeenCalled();
  });

  it.each(["read", "write"] as const)("should discard a %s continuation cancelled during viewer acceptance on page restoration", async (operation) => {
    const data = fixture(); let replacementIdentityPending = false;
    /** Cancels in the acceptance microtask and keeps the replacement native identity read unresolved. */
    const interruptAcceptance = () => {
      data.client.viewer.mockResolvedValueOnce({ status: "ready", value: { id: viewerId } });
      data.client.viewer.mockResolvedValueOnce({ status: "ready", value: { get id() {
        queueMicrotask(() => { const event = new Event("pageshow"); Object.defineProperty(event, "persisted", { value: true }); window.dispatchEvent(event); });
        return viewerId;
      } } });
      data.client.viewer.mockImplementationOnce(() => new Promise(() => { replacementIdentityPending = true; }));
    };
    render(data.node(), { wrapper: Providers }); await ready();
    if (operation === "read") {
      data.client.readEmail.mockImplementationOnce(async () => { interruptAcceptance(); return { status: "ready", value: { viewerId, data: { enabled: true, version: 2, timeZone: "UTC" } } }; });
      fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" }));
    } else {
      data.client.changeEmail.mockImplementationOnce(async (_slug, input) => { interruptAcceptance(); return { status: "ready", value: { viewerId, data: { state: "completed", operationId: input.operationId, replayed: false, result: { status: "changed", settings: { enabled: input.enabled, version: 1, timeZone: input.timeZone } } } } }; });
      fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    }
    await waitFor(() => expect(replacementIdentityPending).toBe(true));
    await act(async () => {});
    expect(screen.queryByRole("form", { name: "Configurar avisos de admisión" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Consultando la cuenta y los ajustes actuales");
    if (operation === "write") { expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(data.client.changeEmail.mock.calls[0][1]); expect(data.client.changePreference).not.toHaveBeenCalled(); }
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should retry an absent original with its exact body only after fresh consent", async () => {
    const data = fixture(); writeAdmissionNotificationSettingsIntent(viewerId, slug, original());
    render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.getByRole("alert")).toHaveTextContent("El cambio original todavía no aparece registrado.");
    expect(screen.getByRole("button", { name: "Guardar avisos" })).toBeDisabled(); expect(data.client.changeEmail).not.toHaveBeenCalled();
    await confirm(); save();
    await waitFor(() => expect(data.client.changeEmail).toHaveBeenCalledWith(slug, original(), expect.any(AbortSignal)));
  });

  it("should announce recovered current settings only after that independent current read completes", async () => {
    const data = fixture(); writeAdmissionNotificationSettingsIntent(viewerId, slug, original("Asia/Kolkata"));
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { state: "completed", operationId: originalId, replayed: true, result: { status: "changed", settings: { enabled: true, version: 1, timeZone: "Asia/Kolkata" } } } } });
    let finish!: (result: Awaited<ReturnType<AdmissionNotificationSettingsBrowserClient["readEmail"]>>) => void;
    data.client.readEmail.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(data.node(), { wrapper: Providers }); await waitFor(() => expect(data.client.readEmail).toHaveBeenCalledOnce());
    expect(screen.queryByText("Recuperamos el resultado del cambio original. Los ajustes actuales se consultaron por separado.")).not.toBeInTheDocument();
    await act(async () => { finish({ status: "ready", value: { viewerId, data: { enabled: true, version: 2, timeZone: "UTC" } } }); });
    expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("UTC");
    expect(screen.getByText("Recuperamos el resultado del cambio original. Los ajustes actuales se consultaron por separado.")).toBeInTheDocument();
    expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should discard a response bound to another viewer even if the current viewer probe still matches", async () => {
    const data = fixture(); data.client.changePreference.mockResolvedValueOnce({ status: "ready", value: { viewerId: "other-viewer", data: { status: "changed", preference: { mode: "grouped", version: 1, source: "stored" } } } });
    render(data.node(), { wrapper: Providers }); await ready(); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.getByText("La cuenta cambió. Volvé a cargar la página antes de continuar.")).toBeInTheDocument());
    expect(screen.queryByRole("form", { name: "Configurar avisos de admisión" })).not.toBeInTheDocument(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should check the viewer before consulting or clearing the original stored by another account", async () => {
    const data = fixture(); writeAdmissionNotificationSettingsIntent(viewerId, slug, original()); data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "other-viewer" } });
    render(data.node(), { wrapper: Providers });
    await waitFor(() => expect(screen.getByText("La cuenta cambió. Volvé a cargar la página antes de continuar.")).toBeInTheDocument());
    expect(data.client.operation).not.toHaveBeenCalled(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original());
  });

  it("should reconcile a replayed POST with current state before continuing with the preference", async () => {
    const data = fixture();
    data.client.changeEmail.mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { viewerId, data: { state: "completed", operationId: input.operationId, replayed: true, result: { status: "changed", settings: { enabled: true, version: 1, timeZone: input.timeZone } } } } }));
    data.client.readEmail.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { enabled: false, version: 2, timeZone: "UTC" } } });
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.getByText("Tus avisos quedaron guardados.")).toBeInTheDocument());
    expect(data.client.readEmail).toHaveBeenCalledOnce(); expect(data.client.changePreference).toHaveBeenCalledOnce();
    expect(screen.getByText("Deshabilitado")).toBeInTheDocument(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull();
    expect(data.client.changeEmail).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should retain a sent original after unmount aborts its late reply instead of asserting rollback", async () => {
    const data = fixture(); let finish!: (result: Awaited<ReturnType<AdmissionNotificationSettingsBrowserClient["changeEmail"]>>) => void;
    data.client.changeEmail.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(data.client.changeEmail).toHaveBeenCalledOnce()); const sent = data.client.changeEmail.mock.calls[0][1], signal = data.client.changeEmail.mock.calls[0][2];
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { finish({ status: "ready", value: { viewerId, data: { state: "completed", operationId: sent.operationId, replayed: false, result: { status: "changed", settings: { enabled: sent.enabled, version: 1, timeZone: sent.timeZone } } } } }); });
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(sent); expect(data.client.changePreference).not.toHaveBeenCalled();
  });

  it("should show a legacy session-change answer as a plain error, keep the original and retry it only after fresh consent", async () => {
    const message = "Tu sesión cambió. Recargá la página e intentá de nuevo.";
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code: "reauthentication_required", message, uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: /Google/ })).not.toBeInTheDocument();
    const sent = data.client.changeEmail.mock.calls[0][1];
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(sent); expect(reviewRow("Correo de la tribu")).toHaveTextContent("Se reintenta el cambio pendiente");
    expect(screen.getByRole("button", { name: "Guardar avisos" })).toBeDisabled();
    await confirm(); save();
    await waitFor(() => expect(data.client.changeEmail).toHaveBeenCalledTimes(2));
    expect(data.client.changeEmail.mock.calls[1][1]).toEqual(sent); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should report a terminal capability rejection without announcing a save or retrying it automatically", async () => {
    const data = fixture(); data.client.changeEmail.mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { viewerId, data: { state: "completed", operationId: input.operationId, replayed: false, result: { status: "rejected", reason: "email_capability_unavailable" } } } }));
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await next(); await next(); await confirm(); save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Falta un correo preparado para habilitar los avisos."));
    expect(screen.getByText("Tu preferencia todavía no se guardó.")).toBeInTheDocument(); expect(screen.queryByText("Tus avisos quedaron guardados.")).not.toBeInTheDocument();
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull(); expect(screen.getByRole("button", { name: "Guardar avisos" })).toBeDisabled();
    expect(data.client.changeEmail).toHaveBeenCalledOnce(); expect(data.client.changePreference).not.toHaveBeenCalled();
  });
});

describe("admission notification settings presenter", () => {
  /** @returns A member's saved state with every callback observable. */
  function memberProps(overrides: Partial<AdmissionNotificationSettingsProps> = {}): AdmissionNotificationSettingsProps {
    return { preference: { mode: "grouped", version: 1, source: "stored" }, mode: "grouped", email: null, draft: { enabled: false, timeZone: "" }, tribeEmailEnabled: null, plan: { email: "unchanged", preference: false }, editing: true, step: 0, busy: false, disabled: false, confirmed: false, pending: false, saving: null, error: null, status: null, progress: null, canCancel: true, messagingHref: "/synthetic-academy/mensajeria", onMode: vi.fn(), onDraft: vi.fn(), onConfirm: vi.fn(), onStep: vi.fn(), onEdit: vi.fn(), onCancel: vi.fn(), onSave: vi.fn(), onRead: vi.fn(), ...overrides };
  }

  it("should tell a member that the tribe has not enabled admission email yet", () => {
    render(<AdmissionNotificationSettings {...memberProps({ tribeEmailEnabled: false })} />, { wrapper: Providers });
    expect(screen.getByText("La tribu todavía no habilitó el correo de admisión")).toBeInTheDocument();
    expect(screen.getByText("No vas a recibir correos hasta que lo haga.")).toBeInTheDocument();
  });

  it("should state in the summary that a disabled tribe email sends nothing", () => {
    const onEdit = vi.fn();
    render(<AdmissionNotificationSettings {...memberProps({ editing: false, tribeEmailEnabled: false, onEdit })} />, { wrapper: Providers });
    expect(screen.getByText("El correo de la tribu está deshabilitado, así que no recibís correos de revisión.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar avisos" })); expect(onEdit).toHaveBeenCalledOnce();
  });

  it("should announce the in-flight sub-step and keep the save button loading", () => {
    render(<AdmissionNotificationSettings {...memberProps({ busy: true, saving: "preference", plan: { email: "unchanged", preference: true } })} />, { wrapper: Providers });
    expect(screen.getByText("Guardando tu preferencia…")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Guardar avisos" })).toHaveAttribute("aria-busy", "true");
  });
});
