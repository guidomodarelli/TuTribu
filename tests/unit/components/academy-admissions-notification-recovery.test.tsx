/** Exercises notification controls with real shared UI and own state/callbacks, without auth or platform mocks. @module notification-recovery-presenter-tests */
import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessagingNotificationRecovery, type MessagingNotificationRecoveryProps } from "@/components/academy-admissions/messaging-notification-recovery";

/** @returns Safe own notification facts and separately controlled original observation callbacks. */
function recoveryProps(): MessagingNotificationRecoveryProps {
  const item = { id: randomUUID(), version: 2, state: "suppressed" as const, connectionId: randomUUID(), createdAt: "2026-10-11T12:00:00Z", deadlineAt: "2026-10-11T13:00:00Z", recoveryDeliveryId: null };
  return { items: [item], selectedDeliveryId: item.id, targetName: "Conexión preparada", catalogAvailable: true, hasMore: false, busy: false, canRead: true, canRecover: true, confirmed: false, hasReference: false, originalCompleted: false, mayResume: false, canArchive: false, archiveConfirmed: false, historyCount: 0, historyFull: false, message: null, onSelect: vi.fn(), onConfirm: vi.fn(), onRefresh: vi.fn(), onMore: vi.fn(), onRecover: vi.fn(), onReadOriginal: vi.fn(), onResumeOriginal: vi.fn(), onClearCompleted: vi.fn(), onStopObserving: vi.fn(), onArchiveConfirm: vi.fn(), onArchive: vi.fn(), onRestoreHistory: vi.fn() };
}

describe("notification recovery presenter", () => {
  it("should require controlled explicit consent without making a request while selecting it", async () => {
    const props = recoveryProps(), user = userEvent.setup(), view = render(<MessagingNotificationRecovery {...props} />);
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Revisé el aviso/ }));
    expect(props.onConfirm).toHaveBeenCalledWith(true); expect(props.onRecover).not.toHaveBeenCalled();
    view.rerender(<MessagingNotificationRecovery {...props} confirmed />);
    await user.click(screen.getByRole("button", { name: "Registrar recuperación" })); expect(props.onRecover).toHaveBeenCalledTimes(1);
  });
  it("should keep uncertainty visible inside TuTribu while recovery is blocked", () => {
    const props = recoveryProps();
    render(<MessagingNotificationRecovery {...props} items={[{ ...props.items[0], state: "unknown" }]} canRecover={false} confirmed />);
    expect(screen.getByRole("alert")).toHaveTextContent(/No se habilita otro envío a ciegas/);
    expect(screen.getByRole("button", { name: "Registrar recuperación" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualizar avisos" })).toBeEnabled();
  });
  it("should consult a retained original before another explicit resumption", async () => {
    const props = recoveryProps(), user = userEvent.setup(), view = render(<MessagingNotificationRecovery {...props} hasReference />);
    expect(screen.queryByRole("button", { name: "Registrar recuperación" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanudar intento original" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Consultar recuperación original" })); expect(props.onReadOriginal).toHaveBeenCalledTimes(1);
    view.rerender(<MessagingNotificationRecovery {...props} hasReference mayResume confirmed />);
    await user.click(screen.getByRole("button", { name: "Reanudar intento original" })); expect(props.onResumeOriginal).toHaveBeenCalledTimes(1);
  });
  it("should distinguish registered recovery from actual message delivery and require explicit clearing", async () => {
    const props = recoveryProps(), user = userEvent.setup(); render(<MessagingNotificationRecovery {...props} hasReference originalCompleted />);
    expect(screen.getByText(/Esto no confirma que el aviso se haya enviado o entregado/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reanudar intento original" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preparar otra recuperación" })); expect(props.onClearCompleted).toHaveBeenCalledTimes(1);
  });
  it("should allow stopping observation without implying cancellation of the server operation", async () => {
    const props = recoveryProps(), user = userEvent.setup(); render(<MessagingNotificationRecovery {...props} hasReference busy />);
    expect(screen.getByRole("button", { name: "Consultar recuperación original" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Dejar de observar" })); expect(props.onStopObserving).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/no cancela ni revierte el trabajo del servidor/)).toBeVisible();
  });
  it("should keep empty and unavailable pages distinct and expose explicit pagination", async () => {
    const props = recoveryProps(), user = userEvent.setup(), view = render(<MessagingNotificationRecovery {...props} items={[]} catalogAvailable={false} />);
    expect(screen.queryByText(/No hay avisos registrados/)).not.toBeInTheDocument();
    view.rerender(<MessagingNotificationRecovery {...props} items={[]} hasMore />);
    expect(screen.getByText(/No hay avisos registrados/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ver avisos anteriores" })); expect(props.onMore).toHaveBeenCalledTimes(1);
  });
});
