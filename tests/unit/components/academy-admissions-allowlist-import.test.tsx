/** Exercises real shared controls and inert imported data on the reachable import presenter. @module allowlist-import-presenter-tests */
import { randomUUID } from "node:crypto";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AllowlistImport, type AllowlistImportProps } from "@/components/academy-admissions/allowlist-import";

/** @returns Controlled preview without an inferred selection or permission. */
function fixture(): AllowlistImportProps {
  return { ready: true, busy: false, privateVisible: true, initializationFailed: false, hasSavedImport: true, onRetryInitialization: vi.fn(), fileName: "synthetic.csv", contactType: "email", snapshot: { importId: randomUUID(), state: "preview", sourceVersion: 1, expiresAt: "2026-10-10T08:00:00Z", counts: { selected: 0, added: 0, unchanged: 0, conflict: 0, skipped: 0 }, rows: [{ rowNumber: 1, identity: "synthetic@example.test", displayName: "<script>inert()</script>", selected: false, errors: [] }, { rowNumber: 2, identity: "invalid", selected: false, errors: ["admission_contact_invalid"] }] }, selection: [], confirmed: false, pending: false, canResume: false, conflict: false, policyConflict: false, unresolvedCount: 0, canReconcile: false, reauthenticationRequired: false, recoveryHref: null, errorMessage: null, fieldError: null, statusMessage: null, onFile: vi.fn(), onConfirmChange: vi.fn(), onSelectRow: vi.fn(), onPreview: vi.fn(), onConfirm: vi.fn(), onReadOriginal: vi.fn(), onReadCurrent: vi.fn(), onReadPolicy: vi.fn(), onReauthenticate: vi.fn(), onTemplate: vi.fn(), onReport: vi.fn(), onReconcile: vi.fn() };
}
describe("import presenter", () => {
  it("should render HTML as text, disable invalid rows and require explicit selection and confirmation", () => {
    const props = fixture(), { container } = render(<AllowlistImport {...props} />);
    expect(screen.getByText("<script>inert()</script>")).toBeVisible(); expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Seleccionar fila 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirmar filas seleccionadas" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar fila 1" })); expect(props.onSelectRow).toHaveBeenCalledWith(1, true); expect(props.onConfirm).not.toHaveBeenCalled();
  });
  it("should preserve row outcomes and offer only original recovery while a response is uncertain", () => {
    const props = fixture(); props.pending = true;
    render(<AllowlistImport {...props} />);
    expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Confirmar filas seleccionadas" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar operación original" })); expect(props.onReadOriginal).toHaveBeenCalledOnce(); expect(props.onConfirm).not.toHaveBeenCalled();
  });
  it("should hide every prior contact and download control when current authority is lost", () => {
    const props = fixture(); props.privateVisible = false; props.errorMessage = "El acceso cambió.";
    render(<AllowlistImport {...props} />);
    expect(screen.queryByText("synthetic@example.test")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Descargar reporte" })).not.toBeInTheDocument(); expect(screen.getByRole("alert")).toBeVisible();
  });
});
