/** Exercises real recovery orchestration and shared UI through own current-viewer, transport and storage ports. @module notification-recovery-container-tests */
import { randomUUID } from "node:crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationRecoveryContainer, type NotificationRecoveryContainerProps } from "@/app/(platform)/[slug]/academia/admissions/messaging/connections/notification-recovery-container";
import type { NotificationRecoverySnapshot } from "@/src/modules/messaging/application/ports/notification-recovery-intent-store";
import type { NotificationRecoveryBrowserClient } from "@/src/modules/messaging/application/ports/notification-recovery-browser-client";
import { NOTIFICATION_RECOVERY_HISTORY_LIMIT } from "@/src/modules/messaging/constants/notification-recovery-intent";
import { NOTIFICATION_RECOVERY_UI_COPY } from "@/src/modules/messaging/constants/notification-recovery-ui";

/** @returns Own metadata and controlled boundary ports; libraries and UI remain real. */
function prepareContainer() {
  const item = { id: randomUUID(), version: 2, state: "suppressed" as const, connectionId: randomUUID(), createdAt: "2026-10-11T12:00:00Z", deadlineAt: "2099-10-11T13:00:00Z", recoveryDeliveryId: null };
  const target = { id: randomUUID(), name: "Conexión nueva", version: 8, configurationVersion: 2, state: "active" as const, credentialState: "valid" as const, credentialMode: "production" as const, maskedCredential: "••••••••" as const, securityCurrent: true, capabilities: [{ channel: "email" as const, state: "prepared" as const, checkedAt: item.createdAt, testedAt: item.createdAt }] };
  const result = { originalDeliveryId: item.id, recoveryDeliveryId: randomUUID(), originalVersion: 3, targetConnectionId: target.id, targetConnectionVersion: 2 };
  let snapshot: NotificationRecoverySnapshot = { draft: { deliveryId: item.id, targetConnectionId: target.id }, reference: null };
  let persist = true;
  const props: NotificationRecoveryContainerProps = {
    slug: "synthetic", viewerId: randomUUID(), renderedAt: item.createdAt, target, blocked: false, viewerVerified: true, initialCatalog: { items: [item], nextCursor: null },
    verifyViewer: vi.fn(async () => true), onBusyChange: vi.fn(),
    store: { read: () => ({ state: "ready", value: snapshot }), save: (_viewer, _slug, value) => { if (!persist) return false; snapshot = value; return true; } },
    client: {
      catalog: vi.fn<NotificationRecoveryBrowserClient["catalog"]>(async () => ({ status: "ready", value: { items: [item], nextCursor: null } })),
      recover: vi.fn<NotificationRecoveryBrowserClient["recover"]>(async (_scope, input) => { expect(snapshot.reference?.operationId).toBe(input.operationId); return { status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result } }; }),
      operation: vi.fn<NotificationRecoveryBrowserClient["operation"]>(async (query) => ({ status: "ready", value: { type: "recover_notification_delivery", state: "completed", operationId: query.operationId, replayed: true, result } })),
    },
  };
  return { props, item, target, result, get snapshot() { return snapshot; }, setSnapshot(value: NotificationRecoverySnapshot) { snapshot = value; }, refusePersistence() { persist = false; } };
}

describe("notification recovery container", () => {
  it("should block blind recovery of an unknown original even with another prepared connection and renewed consent", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(); fixture.props.initialCatalog = { items: [{ ...fixture.item, state: "unknown" }], nextCursor: null };
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé el aviso/ })).toBeEnabled()); await user.click(screen.getByRole("checkbox", { name: /Revisé el aviso/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/No se habilita otro envío a ciegas/); expect(screen.getByRole("button", { name: "Registrar recuperación" })).toBeDisabled(); expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
  it("should block a fresh recovery when history is full and keep prior originals consultable", async () => {
    const fixture = prepareContainer(), user = userEvent.setup();
    const history = Array.from({ length: NOTIFICATION_RECOVERY_HISTORY_LIMIT }, () => ({ operationId: randomUUID(), deliveryId: fixture.item.id, expectedVersion: 2, targetConnectionId: fixture.target.id, expectedTargetVersion: 8 }));
    fixture.setSnapshot({ draft: { deliveryId: fixture.item.id, targetConnectionId: fixture.target.id }, reference: null, history });
    vi.mocked(fixture.props.client!.recover).mockResolvedValue({ status: "failed", code: "delivery_conflict", message: "El aviso cambió.", uncertain: false });
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé el aviso/ })).toBeEnabled()); await user.click(screen.getByRole("checkbox", { name: /Revisé el aviso/ }));
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toBeDisabled();
    expect(fixture.props.client!.recover).not.toHaveBeenCalled(); expect(fixture.snapshot.reference).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Consultar intento conservado 1$/ }));
    await waitFor(() => expect(fixture.snapshot.reference?.operationId).toBe(history[0].operationId));
    expect(fixture.snapshot.history).toHaveLength(NOTIFICATION_RECOVERY_HISTORY_LIMIT - 1); expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
  it("should preserve a stale original in history explicitly and release the form without cancelling or repeating it", async () => {
    const fixture = prepareContainer(), user = userEvent.setup();
    vi.mocked(fixture.props.client!.recover).mockResolvedValue({ status: "failed", code: "delivery_conflict", message: "El aviso cambió.", uncertain: false });
    vi.mocked(fixture.props.client!.operation).mockImplementation(async (query) => ({ status: "ready", value: { type: "recover_notification_delivery", state: "started", operationId: query.operationId, replayed: true } }));
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé el aviso/ })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /Revisé el aviso/ })); await user.click(screen.getByRole("button", { name: "Registrar recuperación" })); await screen.findByRole("alert");
    const originalId = fixture.snapshot.reference!.operationId;
    await user.click(screen.getByRole("button", { name: "Consultar recuperación original" })); await screen.findByText(/La recuperación original sigue en curso/);
    vi.mocked(fixture.props.client!.catalog).mockResolvedValue({ status: "ready", value: { items: [{ ...fixture.item, version: 3 }], nextCursor: null } });
    await user.click(screen.getByRole("button", { name: "Actualizar avisos" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Conservar intento y liberar formulario" })).toBeDisabled());
    await user.click(screen.getByRole("checkbox", { name: /el intento puede continuar/ })); await user.click(screen.getByRole("button", { name: "Conservar intento y liberar formulario" }));
    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
    expect(fixture.snapshot.reference).toBeNull(); expect(fixture.snapshot).toHaveProperty("history", [expect.objectContaining({ operationId: originalId, expectedVersion: 2 })]); expect(fixture.props.client!.recover).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Consultar intento conservado 1" }));
    await waitFor(() => expect(fixture.snapshot.reference?.operationId).toBe(originalId)); expect(fixture.props.client!.recover).toHaveBeenCalledTimes(1);
  });
  it("should preserve the exact original before one explicit POST and never refresh the route", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(); render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    expect(fixture.props.client!.recover).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Registrar recuperación" }));
    await screen.findByText(/La recuperación quedó registrada\. Consultá el estado/);
    expect(fixture.props.client!.recover).toHaveBeenCalledTimes(1); expect(fixture.props.client!.catalog).not.toHaveBeenCalled();
    expect(fixture.snapshot.reference).toMatchObject({ deliveryId: fixture.item.id, expectedVersion: 2, targetConnectionId: fixture.target.id, expectedTargetVersion: 8 });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(fixture.props.onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it("should keep the pressed registration busy and announce it while the recovery write is pending", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(); let resolveRecover!: (value: Awaited<ReturnType<NotificationRecoveryBrowserClient["recover"]>>) => void;
    vi.mocked(fixture.props.client!.recover).mockImplementationOnce(async () => new Promise((resolve) => { resolveRecover = resolve; }));
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled()); await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Registrar recuperación" }));
    await waitFor(() => expect(fixture.props.client!.recover).toHaveBeenCalledTimes(1));
    // The preserved original does not swap the pressed control for the reference controls until the write ends.
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Reanudar intento original" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar avisos" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(NOTIFICATION_RECOVERY_UI_COPY.registering);
    const input = vi.mocked(fixture.props.client!.recover).mock.calls[0][1];
    await act(async () => resolveRecover({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: false, result: fixture.result } }));
    expect(await screen.findByText(NOTIFICATION_RECOVERY_UI_COPY.completed)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Registrar recuperación" })).not.toBeInTheDocument();
  });
  it("should not mark a recovery write as busy while only the notification catalog is read", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(); let resolveCatalog!: (value: Awaited<ReturnType<NotificationRecoveryBrowserClient["catalog"]>>) => void;
    vi.mocked(fixture.props.client!.catalog).mockImplementationOnce(async () => new Promise((resolve) => { resolveCatalog = resolve; }));
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualizar avisos" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Actualizar avisos" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(NOTIFICATION_RECOVERY_UI_COPY.reading));
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).not.toHaveAttribute("aria-busy");
    await act(async () => resolveCatalog({ status: "ready", value: { items: [fixture.item], nextCursor: null } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualizar avisos" })).toBeEnabled());
  });
  it("should keep the pressed resumption busy while the preserved original is sent again", async () => {
    const fixture = prepareContainer(), user = userEvent.setup();
    vi.mocked(fixture.props.client!.recover).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "Resultado incierto", uncertain: true });
    vi.mocked(fixture.props.client!.operation).mockImplementationOnce(async (query) => ({ status: "ready", value: { type: "recover_notification_delivery", state: "started", operationId: query.operationId, replayed: true } }));
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé el aviso/ })).toBeEnabled()); await user.click(screen.getByRole("checkbox", { name: /Revisé el aviso/ }));
    await user.click(screen.getByRole("button", { name: "Registrar recuperación" })); await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Consultar recuperación original" })); await screen.findByText(NOTIFICATION_RECOVERY_UI_COPY.originalStarted);
    await user.click(screen.getByRole("checkbox", { name: /Revisé el aviso/ }));
    let resolveResume!: (value: Awaited<ReturnType<NotificationRecoveryBrowserClient["recover"]>>) => void;
    vi.mocked(fixture.props.client!.recover).mockImplementationOnce(async () => new Promise((resolve) => { resolveResume = resolve; }));
    await user.click(screen.getByRole("button", { name: "Reanudar intento original" }));
    await waitFor(() => expect(fixture.props.client!.recover).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Reanudar intento original" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Consultar recuperación original" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Conservar intento y liberar formulario" })).toBeDisabled();
    const input = vi.mocked(fixture.props.client!.recover).mock.calls[1][1];
    expect(input.operationId).toBe(vi.mocked(fixture.props.client!.recover).mock.calls[0][1].operationId);
    await act(async () => resolveResume({ status: "ready", value: { state: "completed", operationId: input.operationId, replayed: true, result: fixture.result } }));
    expect(await screen.findByText(NOTIFICATION_RECOVERY_UI_COPY.completed)).toBeVisible();
  });
  it("should recover a lost reply through GET after reload without another POST or restored consent", async () => {
    const fixture = prepareContainer(), user = userEvent.setup();
    vi.mocked(fixture.props.client!.recover).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "Resultado incierto", uncertain: true });
    const view = render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled()); await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Registrar recuperación" }));
    await screen.findByRole("alert"); expect(fixture.snapshot.reference).not.toBeNull(); view.unmount();
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar recuperación original" })).toBeEnabled());
    expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(screen.getByRole("button", { name: "Reanudar intento original" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Consultar recuperación original" }));
    await screen.findByRole("button", { name: "Preparar otra recuperación" }); expect(fixture.props.client!.recover).toHaveBeenCalledTimes(1); expect(fixture.props.client!.operation).toHaveBeenCalledTimes(1);
  });
  it("should block POST when the original cannot be preserved locally", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(); render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled()); fixture.refusePersistence(); await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Registrar recuperación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No pudimos conservar la referencia/); expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
  it("should keep corrupt storage feedback visible and deny every action", async () => {
    const fixture = prepareContainer(); fixture.props.store = { read: () => ({ state: "unavailable" }), save: () => false }; render(<NotificationRecoveryContainer {...fixture.props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/No pudimos conservar la referencia/); expect(screen.getByRole("button", { name: "Actualizar avisos" })).toBeDisabled(); expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
  it("should retain a mismatched completed original rather than clearing its attempted reference", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(); fixture.setSnapshot({ draft: null, reference: { operationId: randomUUID(), deliveryId: fixture.item.id, expectedVersion: 2, targetConnectionId: fixture.target.id, expectedTargetVersion: 8 } });
    vi.mocked(fixture.props.client!.operation).mockImplementation(async (query) => ({ status: "ready", value: { type: "recover_notification_delivery", state: "completed", operationId: query.operationId, replayed: true, result: { ...fixture.result, originalDeliveryId: randomUUID() } } }));
    render(<NotificationRecoveryContainer {...fixture.props} />); await waitFor(() => expect(screen.getByRole("button", { name: "Consultar recuperación original" })).toBeEnabled()); await user.click(screen.getByRole("button", { name: "Consultar recuperación original" }));
    await screen.findByRole("alert"); expect(screen.queryByRole("button", { name: "Preparar otra recuperación" })).not.toBeInTheDocument(); expect(fixture.snapshot.reference).not.toBeNull(); expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
  it("should hide returned metadata when the current viewer changes during a read", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(); vi.mocked(fixture.props.verifyViewer).mockResolvedValueOnce(true).mockResolvedValueOnce(false); render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualizar avisos" })).toBeEnabled()); await user.click(screen.getByRole("button", { name: "Actualizar avisos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/La sesión cambió/); expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Actualizar avisos" })).toBeDisabled();
  });
  it("should offer no Google confirmation and keep the selected draft without posting before explicit consent", async () => {
    const fixture = prepareContainer(); render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé el aviso/ })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: /Google/ })).not.toBeInTheDocument();
    expect(fixture.props.client!.recover).not.toHaveBeenCalled(); expect(fixture.snapshot.draft?.deliveryId).toBe(fixture.item.id);
  });
  it("should add earlier notices below the current page and keep the chosen notice when loading them", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(), earlier = { ...fixture.item, id: randomUUID(), createdAt: "2026-10-01T12:00:00Z" };
    fixture.props.initialCatalog = { items: [fixture.item], nextCursor: { deliveryId: fixture.item.id, createdAt: fixture.item.createdAt } };
    vi.mocked(fixture.props.client!.catalog).mockResolvedValue({ status: "ready", value: { items: [earlier], nextCursor: null } });
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ver avisos anteriores" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Ver avisos anteriores" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Ver avisos anteriores" })).not.toBeInTheDocument());
    expect(fixture.props.client!.catalog).toHaveBeenCalledWith({ slug: "synthetic", cursor: { deliveryId: fixture.item.id, createdAt: fixture.item.createdAt } }, expect.any(AbortSignal));
    expect(screen.getByRole("combobox", { name: "Aviso que querés recuperar" })).toHaveTextContent("Aviso 1");
    await user.click(screen.getByRole("combobox", { name: "Aviso que querés recuperar" }));
    expect(await screen.findByRole("option", { name: /^Aviso 1 .*2026-10-11/ })).toBeVisible(); expect(screen.getByRole("option", { name: /^Aviso 2 .*2026-10-01/ })).toBeVisible();
    expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
  it("should show a notice whose deadline passed as no longer recoverable, without its consent or recovery action", async () => {
    const fixture = prepareContainer(); fixture.props.initialCatalog = { items: [{ ...fixture.item, deadlineAt: "2026-10-11T13:00:00Z" }], nextCursor: null };
    render(<NotificationRecoveryContainer {...fixture.props} />);
    expect(await screen.findByText(NOTIFICATION_RECOVERY_UI_COPY.expired)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Registrar recuperación" })).not.toBeInTheDocument(); expect(screen.queryByRole("checkbox", { name: /Revisé el aviso/ })).not.toBeInTheDocument();
    expect(screen.queryByText(NOTIFICATION_RECOVERY_UI_COPY.selectionRequired)).not.toBeInTheDocument(); expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
  it("should withdraw the recovery action when the selected notice's deadline passes while the page is open", async () => {
    const fixture = prepareContainer(), renderedAt = new Date().toISOString();
    fixture.props.renderedAt = renderedAt; fixture.props.initialCatalog = { items: [{ ...fixture.item, deadlineAt: new Date(Date.now() + 600).toISOString() }], nextCursor: null };
    render(<NotificationRecoveryContainer {...fixture.props} />);
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toBeVisible();
    expect(await screen.findByText(NOTIFICATION_RECOVERY_UI_COPY.expired, {}, { timeout: 3000 })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Registrar recuperación" })).not.toBeInTheDocument(); expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
  it("should forget a recovery the platform rejected before registering it, with its copy and nothing to resume", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(), message = "La mensajería depende del equipo de TuTribu: la plataforma todavía no puede proteger esta operación. No se registró ningún cambio.";
    vi.mocked(fixture.props.client!.recover).mockResolvedValue({ status: "failed", code: "platform_security_unavailable", message, uncertain: false });
    render(<NotificationRecoveryContainer {...fixture.props} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé el aviso/ })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: /Revisé el aviso/ })); await user.click(screen.getByRole("button", { name: "Registrar recuperación" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(fixture.snapshot.reference).toBeNull();
    expect(screen.queryByRole("button", { name: "Consultar recuperación original" })).not.toBeInTheDocument();
    expect(fixture.props.client!.recover).toHaveBeenCalledOnce();
  });
  it("should keep reading notices but withhold recoveries while the platform cannot protect them, and forget an unregistered original", async () => {
    const fixture = prepareContainer(), user = userEvent.setup(), original = { operationId: randomUUID(), deliveryId: fixture.item.id, expectedVersion: 2, targetConnectionId: fixture.target.id, expectedTargetVersion: 8 };
    fixture.setSnapshot({ draft: { deliveryId: fixture.item.id, targetConnectionId: fixture.target.id }, reference: original });
    vi.mocked(fixture.props.client!.operation).mockResolvedValue({ status: "failed", code: "resource_unavailable", message: "El recurso solicitado no está disponible.", uncertain: false });
    render(<NotificationRecoveryContainer {...fixture.props} platformRequirement="recovery_locked" />);
    await user.click(await screen.findByRole("button", { name: "Consultar recuperación original" }));
    await waitFor(() => expect(screen.getByText(NOTIFICATION_RECOVERY_UI_COPY.platformForgotten)).toBeInTheDocument());
    expect(fixture.snapshot.reference).toBeNull();
    expect(screen.queryByRole("button", { name: /Reanudar/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Revisé el aviso/ })).toBeEnabled()); await user.click(screen.getByRole("checkbox", { name: /Revisé el aviso/ }));
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toBeDisabled();
    expect(fixture.props.client!.recover).not.toHaveBeenCalled();
  });
});
