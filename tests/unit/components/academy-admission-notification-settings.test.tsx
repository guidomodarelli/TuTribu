/** Exercises settings interaction with real shared controls, framework context and owned ports only. @module admission-notification-settings-container-tests */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionNotificationSettingsContainer } from "@/app/(platform)/[slug]/academia/admissions/notifications/notification-settings-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionNotificationSettingsBrowserClient } from "@/src/modules/notifications/application/ports/admission-notification-settings-browser-client";
import type { AdmissionNotificationSettingsPageState } from "@/src/modules/notifications/application/results/admission-notification-settings-page-state";
import type { ReauthenticationIntentBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import { readAdmissionNotificationSettingsIntent, writeAdmissionNotificationSettingsIntent } from "@/lib/academy-admissions/admission-notification-settings-intent";

const tribeId = "83ecbfaf-0e7c-4afb-aefc-62b62800d367", viewerId = "synthetic-notification-leader", slug = "synthetic-academy";
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
  const reauthentication = { create: vi.fn<ReauthenticationIntentBrowserClient["create"]>(async () => ({ status: "ready", href: "/auth/reauthenticate?intentId=synthetic-intent" })) };
  return { state, client, reauthentication, node: () => <AdmissionNotificationSettingsContainer initialState={state} client={client} reauthentication={reauthentication} /> };
}
/** Waits for the real native viewer check before explicit interactions. */
async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "Consultar estado actual" })).not.toBeDisabled()); }
/** Consent is a fresh UI event and never restored from the original stored body. */
async function confirm() { const checkbox = screen.getByRole("checkbox", { name: /Confirmo la habilitación/ }); await waitFor(() => expect(checkbox).not.toBeDisabled()); fireEvent.click(checkbox); }
/** Uses the actual shared Select interaction. */
async function chooseDaily() { const user = userEvent.setup(); await user.click(screen.getByRole("combobox", { name: "Frecuencia" })); await user.click(screen.getByRole("option", { name: "Resumen diario" })); }

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });

describe("admission notification settings workflow", () => {
  it("should keep server and first client markup consistent before restoring a different local draft", async () => {
    const data = fixture(), original = { operationId: "f5536335-668a-4b6e-a972-f76c95c7c822", confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "Asia/Kolkata" };
    writeAdmissionNotificationSettingsIntent(viewerId, slug, original);
    const tree = <Providers>{data.node()}</Providers>, container = document.createElement("div"), recoverable: unknown[] = [];
    container.innerHTML = renderToString(tree); document.body.append(container);
    expect(within(container).getByLabelText("Zona horaria de la tribu")).toHaveValue("America/Argentina/Buenos_Aires");
    let root: ReturnType<typeof hydrateRoot> | null = null;
    try {
      await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: (error) => recoverable.push(error) }); });
      await waitFor(() => expect(within(container).getByRole("button", { name: "Reintentar el cambio original" })).toBeInTheDocument());
      expect(recoverable).toEqual([]); expect(within(container).getByLabelText("Zona horaria de la tribu")).toHaveValue("Asia/Kolkata");
      expect(within(container).getByRole("checkbox", { name: /Confirmo la habilitación/ })).not.toBeChecked(); expect(data.client.changeEmail).not.toHaveBeenCalled();
    } finally { await act(async () => { root?.unmount(); }); container.remove(); }
  });

  it("should hydrate its SSR snapshot without duplicate initial settings reads or automatic writes", async () => {
    const data = fixture(); render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("America/Argentina/Buenos_Aires");
    expect(data.client.readPreference).not.toHaveBeenCalled(); expect(data.client.readEmail).not.toHaveBeenCalled();
    expect(data.client.changePreference).not.toHaveBeenCalled(); expect(data.client.changeEmail).not.toHaveBeenCalled(); expect(data.reauthentication.create).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar correo de admisión" })).toBeDisabled();
  });

  it("should let a guardian save only their own frequency while keeping leader controls absent", async () => {
    const data = fixture(); data.state.canConfigureEmail = false; data.state.email = null; data.state.preference.mode = "omitted";
    render(data.node(), { wrapper: Providers }); await ready(); await chooseDaily();
    fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" }));
    await waitFor(() => expect(within(screen.getByRole("form", { name: "Mi preferencia de correo" })).getByRole("status")).toHaveTextContent("Tu preferencia quedó guardada."));
    expect(data.client.changePreference).toHaveBeenCalledWith(slug, { mode: "daily", expectedVersion: 0 }, expect.any(AbortSignal));
    expect(screen.queryByRole("checkbox", { name: "Habilitar correo de admisión" })).not.toBeInTheDocument();
    expect(data.client.changeEmail).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should preserve an old privileged intent without blocking the current guardian's personal preference", async () => {
    const data = fixture(), original = { operationId: "f5536335-668a-4b6e-a972-f76c95c7c822", confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "UTC" };
    data.state.canConfigureEmail = false; data.state.email = null; data.state.preference.mode = "omitted";
    writeAdmissionNotificationSettingsIntent(viewerId, slug, original);
    data.client.operation.mockResolvedValue({ status: "failed", code: "permission_denied", message: "La configuración requiere liderazgo actual.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.getByRole("button", { name: "Guardar mi preferencia" })).not.toBeDisabled(); expect(data.client.operation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" }));
    await waitFor(() => expect(data.client.changePreference).toHaveBeenCalledOnce());
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original); expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should allow a fresh personal preference while an independent email original is genuinely started", async () => {
    const data = fixture(), original = { operationId: "f5536335-668a-4b6e-a972-f76c95c7c822", confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "UTC" };
    writeAdmissionNotificationSettingsIntent(viewerId, slug, original);
    data.client.operation.mockResolvedValue({ status: "ready", value: { viewerId, data: { state: "started", operationId: original.operationId } } });
    render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.getByRole("button", { name: "Reintentar el cambio original" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar mi preferencia" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" })); await waitFor(() => expect(data.client.changePreference).toHaveBeenCalledOnce());
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original); expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should initialize authorized email fields when a guardian becomes the current leader after a read", async () => {
    const data = fixture(); data.state.canConfigureEmail = false; data.state.email = null; data.state.preference.mode = "omitted";
    render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.queryByRole("form", { name: "Correo de la tribu" })).not.toBeInTheDocument();
    data.client.readPreference.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { preference: { mode: "omitted", version: 1, source: "stored" }, canConfigureEmail: true } } });
    data.client.readEmail.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { enabled: true, version: 2, timeZone: "UTC" } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("UTC"); expect(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirmo la habilitación/ })).not.toBeChecked(); expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should clear consent on edits and block a blank timezone before any email write", async () => {
    const data = fixture(); render(data.node(), { wrapper: Providers }); await ready(); await confirm();
    fireEvent.change(screen.getByLabelText("Zona horaria de la tribu"), { target: { value: " " } });
    expect(screen.getByRole("checkbox", { name: /Confirmo la habilitación/ })).not.toBeChecked();
    await confirm(); expect(screen.getByRole("button", { name: "Guardar correo de admisión" })).toBeDisabled();
    expect(screen.getByText("Indicá una zona horaria antes de guardar.")).toBeInTheDocument(); expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should persist the exact email command before sending and apply a new minimal result without refreshing", async () => {
    const data = fixture();
    data.client.changeEmail.mockImplementationOnce(async (_slug, input) => {
      expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(input);
      return { status: "ready", value: { viewerId, data: { state: "completed", operationId: input.operationId, replayed: false, result: { status: "changed", settings: { enabled: input.enabled, version: 1, timeZone: input.timeZone } } } } };
    });
    render(data.node(), { wrapper: Providers }); await ready(); fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(within(screen.getByRole("form", { name: "Correo de la tribu" })).getByText("La configuración del correo quedó guardada.")).toBeInTheDocument());
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull(); expect(data.client.readEmail).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should preserve a personal CAS conflict, clear stale feedback on edits and read before another confirmation", async () => {
    const data = fixture(); data.client.changePreference.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { status: "rejected", reason: "notification_preference_version_conflict" } } });
    data.client.readPreference.mockResolvedValue({ status: "ready", value: { viewerId, data: { preference: { mode: "individual", version: 2, source: "stored" }, canConfigureEmail: true } } });
    render(data.node(), { wrapper: Providers }); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Tu preferencia cambió en otra ventana."));
    expect(screen.getByRole("button", { name: "Guardar mi preferencia" })).toBeDisabled(); await chooseDaily();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(screen.getByText("Consultá el estado actual antes de guardar otro cambio.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(data.client.changePreference).toHaveBeenCalledOnce(); fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" }));
    await waitFor(() => expect(data.client.changePreference).toHaveBeenCalledTimes(2));
    expect(data.client.changePreference.mock.calls[1][1]).toEqual({ mode: "daily", expectedVersion: 2 }); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should query a lost personal reply before another write without inventing a durable operation UUID", async () => {
    const data = fixture(); data.client.changePreference.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "Respuesta no disponible.", uncertain: true });
    render(data.node(), { wrapper: Providers }); await ready(); fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No confirmamos si se guardó tu preferencia."));
    expect(screen.getByRole("button", { name: "Guardar mi preferencia" })).toBeDisabled(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(data.client.changePreference).toHaveBeenCalledOnce(); expect(data.client.readPreference).toHaveBeenCalledOnce(); expect(data.client.operation).not.toHaveBeenCalled();
  });

  it("should keep genuine started work and later reconcile its historical original with a newer current version", async () => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "Respuesta no disponible.", uncertain: true });
    render(data.node(), { wrapper: Providers }); await ready(); fireEvent.change(screen.getByLabelText("Zona horaria de la tribu"), { target: { value: "Asia/Kolkata" } }); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(data.client.changeEmail).toHaveBeenCalledOnce()); const original = data.client.changeEmail.mock.calls[0][1];
    await ready(); data.client.operation.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { state: "started", operationId: original.operationId } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(screen.getByRole("button", { name: "Reintentar el cambio original" })).toBeDisabled(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original);
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { state: "completed", operationId: original.operationId, replayed: true, result: { status: "changed", settings: { enabled: false, version: 1, timeZone: "Asia/Kolkata" } } } } });
    data.client.readEmail.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { enabled: false, version: 2, timeZone: "UTC" } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready();
    expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("UTC"); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull();
    expect(data.client.changeEmail).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should explicitly resume the same started original with fresh consent without inventing a new command", async () => {
    const data = fixture(), original = { operationId: "f5536335-668a-4b6e-a972-f76c95c7c822", confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "UTC" };
    writeAdmissionNotificationSettingsIntent(viewerId, slug, original);
    data.client.operation.mockResolvedValue({ status: "ready", value: { viewerId, data: { state: "started", operationId: original.operationId } } });
    data.client.changeEmail.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { state: "started", operationId: original.operationId } } });
    render(data.node(), { wrapper: Providers }); await ready();
    expect(data.client.changeEmail).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Reintentar el cambio original" })).toBeDisabled();
    await confirm(); expect(screen.getByRole("button", { name: "Reintentar el cambio original" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el cambio original" }));
    await waitFor(() => expect(data.client.changeEmail).toHaveBeenCalledOnce()); await ready();
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original);
    expect(screen.getByRole("checkbox", { name: /Confirmo la habilitación/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })); await ready(); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el cambio original" }));
    await waitFor(() => expect(data.client.changeEmail).toHaveBeenCalledTimes(2));
    expect(data.client.changeEmail.mock.calls.map((call) => call[1])).toEqual([original, original]);
    await waitFor(() => expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull());
    expect(data.reauthentication.create).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each(["permission_denied", "resource_unavailable", "authentication_required"] as const)("should hide private settings after a personal write loses current authority with %s", async (code) => {
    const data = fixture(); data.client.changePreference.mockResolvedValueOnce({ status: "failed", code, message: "El acceso actual no permite cambiar los avisos.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready(); fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Mi preferencia de correo" })).not.toBeInTheDocument());
    expect(screen.queryByRole("form", { name: "Correo de la tribu" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("El acceso actual no permite cambiar los avisos."); expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each(["permission_denied", "resource_unavailable", "authentication_required"] as const)("should hide private settings and preserve the exact sent email original after %s", async (code) => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code, message: "El liderazgo actual no permite cambiar el correo.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Correo de la tribu" })).not.toBeInTheDocument());
    expect(screen.queryByRole("form", { name: "Mi preferencia de correo" })).not.toBeInTheDocument();
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(data.client.changeEmail.mock.calls[0][1]);
    expect(screen.getByRole("alert")).toHaveTextContent("El liderazgo actual no permite cambiar el correo.");
    expect(data.client.operation).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should replace stale Google feedback with a later personal permission denial while retaining its pending original", async () => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code: "reauthentication_required", message: "Confirmá tu autenticación para continuar.", uncertain: false });
    data.client.changePreference.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "Ya no tenés acceso a estos avisos.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preparar confirmación con Google" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Mi preferencia de correo" })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Ya no tenés acceso a estos avisos.");
    expect(screen.queryByText("Confirmá tu autenticación para continuar.")).not.toBeInTheDocument();
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(data.client.changeEmail.mock.calls[0][1]);
  });

  it("should recover only the current guardian's preference after a denied leader write without reading or erasing its original", async () => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "El liderazgo actual no permite cambiar el correo.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Correo de la tribu" })).not.toBeInTheDocument());
    const original = data.client.changeEmail.mock.calls[0][1];
    data.client.readPreference.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { preference: { mode: "omitted", version: 1, source: "stored" }, canConfigureEmail: false } } });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); await ready();
    expect(screen.getByRole("button", { name: "Guardar mi preferencia" })).not.toBeDisabled();
    expect(screen.queryByRole("form", { name: "Correo de la tribu" })).not.toBeInTheDocument();
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original);
    expect(data.client.operation).not.toHaveBeenCalled(); expect(data.client.readEmail).not.toHaveBeenCalled();
  });

  it.each(["read", "write"] as const)("should discard a %s continuation cancelled during viewer acceptance on page restoration", async (operation) => {
    const data = fixture();
    let replacementIdentityPending = false;
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
      await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    }
    await waitFor(() => expect(replacementIdentityPending).toBe(true));
    await act(async () => {});
    expect(screen.queryByRole("form", { name: "Correo de la tribu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Mi preferencia de correo" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Consultando la cuenta y los ajustes actuales");
    if (operation === "write") expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(data.client.changeEmail.mock.calls[0][1]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should restore an absent original without restoring consent or automatically retrying its write", async () => {
    const data = fixture(), original = { operationId: "f5536335-668a-4b6e-a972-f76c95c7c822", confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "UTC" };
    writeAdmissionNotificationSettingsIntent(viewerId, slug, original); render(data.node(), { wrapper: Providers }); await ready();
    expect(screen.getByRole("checkbox", { name: /Confirmo la habilitación/ })).not.toBeChecked(); expect(data.client.changeEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reintentar el cambio original" })).toBeDisabled(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Reintentar el cambio original" }));
    await waitFor(() => expect(data.client.changeEmail).toHaveBeenCalledWith(slug, original, expect.any(AbortSignal))); expect(data.reauthentication.create).not.toHaveBeenCalled();
  });

  it("should announce recovered current settings only after that independent current read completes", async () => {
    const data = fixture(), original = { operationId: "f5536335-668a-4b6e-a972-f76c95c7c822", confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "Asia/Kolkata" };
    writeAdmissionNotificationSettingsIntent(viewerId, slug, original);
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { state: "completed", operationId: original.operationId, replayed: true, result: { status: "changed", settings: { enabled: true, version: 1, timeZone: "Asia/Kolkata" } } } } });
    let finish!: (result: Awaited<ReturnType<AdmissionNotificationSettingsBrowserClient["readEmail"]>>) => void;
    data.client.readEmail.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(data.node(), { wrapper: Providers }); await waitFor(() => expect(data.client.readEmail).toHaveBeenCalledOnce());
    expect(screen.queryByText("Recuperamos el resultado del cambio original. Los ajustes actuales se consultaron por separado.")).not.toBeInTheDocument();
    await act(async () => { finish({ status: "ready", value: { viewerId, data: { enabled: false, version: 2, timeZone: "UTC" } } }); });
    expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("UTC");
    expect(screen.getByText("Recuperamos el resultado del cambio original. Los ajustes actuales se consultaron por separado.")).toBeInTheDocument();
    expect(data.client.changeEmail).not.toHaveBeenCalled();
  });

  it("should discard a response bound to another viewer even if the current viewer probe still matches", async () => {
    const data = fixture(); data.client.changePreference.mockResolvedValueOnce({ status: "ready", value: { viewerId: "other-viewer", data: { status: "changed", preference: { mode: "grouped", version: 1, source: "stored" } } } });
    render(data.node(), { wrapper: Providers }); await ready(); fireEvent.click(screen.getByRole("button", { name: "Guardar mi preferencia" }));
    await waitFor(() => expect(screen.getByText("La cuenta cambió. Volvé a cargar la página antes de continuar.")).toBeInTheDocument());
    expect(screen.queryByRole("form", { name: "Correo de la tribu" })).not.toBeInTheDocument(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should check the viewer before consulting or clearing the original stored by another account", async () => {
    const data = fixture(), original = { operationId: "f5536335-668a-4b6e-a972-f76c95c7c822", confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "UTC" };
    writeAdmissionNotificationSettingsIntent(viewerId, slug, original); data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "other-viewer" } });
    render(data.node(), { wrapper: Providers });
    await waitFor(() => expect(screen.getByText("La cuenta cambió. Volvé a cargar la página antes de continuar.")).toBeInTheDocument());
    expect(data.client.operation).not.toHaveBeenCalled(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original);
  });

  it("should reconcile a replayed POST with current state rather than applying its older settings to the draft", async () => {
    const data = fixture();
    data.client.changeEmail.mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { viewerId, data: { state: "completed", operationId: input.operationId, replayed: true, result: { status: "changed", settings: { enabled: true, version: 1, timeZone: input.timeZone } } } } }));
    data.client.readEmail.mockResolvedValueOnce({ status: "ready", value: { viewerId, data: { enabled: false, version: 2, timeZone: "UTC" } } });
    render(data.node(), { wrapper: Providers }); await ready(); fireEvent.click(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })); await confirm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(screen.getByLabelText("Zona horaria de la tribu")).toHaveValue("UTC"));
    expect(screen.getByRole("checkbox", { name: "Habilitar correo de admisión" })).not.toBeChecked(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull();
    expect(data.client.changeEmail).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should retain a sent original after unmount aborts its late reply instead of asserting rollback", async () => {
    const data = fixture(); let finish!: (result: Awaited<ReturnType<AdmissionNotificationSettingsBrowserClient["changeEmail"]>>) => void;
    data.client.changeEmail.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(data.node(), { wrapper: Providers }); await ready(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(data.client.changeEmail).toHaveBeenCalledOnce()); const original = data.client.changeEmail.mock.calls[0][1], signal = data.client.changeEmail.mock.calls[0][2];
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { finish({ status: "ready", value: { viewerId, data: { state: "completed", operationId: original.operationId, replayed: false, result: { status: "changed", settings: { enabled: original.enabled, version: 1, timeZone: original.timeZone } } } } }); });
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toEqual(original);
  });

  it("should prepare the exact Google continuation only after an explicit action and leave the write pending", async () => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code: "reauthentication_required", message: "Confirmá tu autenticación para continuar.", uncertain: false });
    render(data.node(), { wrapper: Providers }); await ready(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preparar confirmación con Google" })).toBeInTheDocument()); expect(data.reauthentication.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Preparar confirmación con Google" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Continuar con Google" })).toHaveAttribute("href", "/auth/reauthenticate?intentId=synthetic-intent"));
    expect(data.reauthentication.create).toHaveBeenCalledWith({ tribeId, resourceId: tribeId, operation: "update_admission_email_settings", returnPath: `/${slug}/academia/admissions/notifications`, confirmed: true }, expect.any(AbortSignal));
    expect(screen.getByRole("checkbox", { name: /Confirmo la habilitación/ })).not.toBeChecked(); expect(data.client.changeEmail).toHaveBeenCalledOnce(); expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).not.toBeNull();
  });

  it("should clear a failed Google preparation before an explicit retry without resending the email change", async () => {
    const data = fixture(); data.client.changeEmail.mockResolvedValueOnce({ status: "failed", code: "reauthentication_required", message: "Confirmá tu autenticación para continuar.", uncertain: false });
    data.reauthentication.create.mockResolvedValueOnce({ status: "failed" });
    render(data.node(), { wrapper: Providers }); await ready(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preparar confirmación con Google" })).toBeInTheDocument()); fireEvent.click(screen.getByRole("button", { name: "Preparar confirmación con Google" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos preparar la confirmación de Google."));
    let finish!: (result: Awaited<ReturnType<ReauthenticationIntentBrowserClient["create"]>>) => void;
    data.reauthentication.create.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Preparar confirmación con Google" }));
    await waitFor(() => expect(data.reauthentication.create).toHaveBeenCalledTimes(2)); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => { finish({ status: "ready", href: "/auth/reauthenticate?intentId=synthetic-intent" }); });
    expect(screen.getByRole("link", { name: "Continuar con Google" })).toBeInTheDocument(); expect(data.client.changeEmail).toHaveBeenCalledOnce();
  });

  it("should report a terminal capability rejection without announcing saved state or retrying it automatically", async () => {
    const data = fixture(); data.client.changeEmail.mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { viewerId, data: { state: "completed", operationId: input.operationId, replayed: false, result: { status: "rejected", reason: "email_capability_unavailable" } } } }));
    render(data.node(), { wrapper: Providers }); await ready(); await confirm(); fireEvent.click(screen.getByRole("button", { name: "Guardar correo de admisión" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Falta un correo preparado para habilitar los avisos."));
    expect(readAdmissionNotificationSettingsIntent(viewerId, slug)).toBeNull(); expect(screen.getByRole("button", { name: "Guardar correo de admisión" })).toBeDisabled(); expect(data.client.changeEmail).toHaveBeenCalledOnce();
  });
});
