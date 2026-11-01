/** Exercises real shared controls and inert imported data on the reachable import presenter. @module allowlist-import-presenter-tests */
import { randomUUID } from "node:crypto";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AllowlistImport, type AllowlistImportProps } from "@/components/academy-admissions/allowlist-import";
import { ALLOWLIST_IMPORT_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { PLATFORM_SECURITY_NOTICE_COPY, PLATFORM_SECURITY_REQUIREMENT_COPY } from "@/src/modules/academy-admissions/constants/platform-security-notice";

/** @returns Controlled preview without an inferred selection or permission. */
function fixture(): AllowlistImportProps {
  return { policyHref: "/synthetic/academia/admissions/settings", platformRequirement: null, originalAbsent: false, onDiscardOriginal: vi.fn(), ready: true, busy: false, writeAction: null, privateVisible: true, initializationFailed: false, hasSavedImport: true, onRetryInitialization: vi.fn(), fileName: "synthetic.csv", contactType: "email", snapshot: { importId: randomUUID(), state: "preview", sourceVersion: 1, expiresAt: "2026-10-10T08:00:00Z", counts: { selected: 0, added: 0, unchanged: 0, conflict: 0, skipped: 0 }, rows: [{ rowNumber: 1, identity: "synthetic@example.test", displayName: "<script>inert()</script>", selected: false, errors: [] }, { rowNumber: 2, identity: "invalid", selected: false, errors: ["admission_contact_invalid"] }] }, selection: [], confirmed: false, pending: false, canResume: false, conflict: false, policyConflict: false, unresolvedCount: 0, canReconcile: false, errorMessage: null, fieldError: null, statusMessage: null, step: 1, onStepChange: vi.fn(), onFile: vi.fn(), onConfirmChange: vi.fn(), onSelectRow: vi.fn(), onSelectAllValid: vi.fn(), onPreview: vi.fn(), onConfirm: vi.fn(), onReadOriginal: vi.fn(), onReadCurrent: vi.fn(), onRecheckPlatform: vi.fn(), onReadPolicy: vi.fn(), onTemplate: vi.fn(), onReport: vi.fn(), onReconcile: vi.fn() };
}
describe("import presenter", () => {
  it("should send the leader to the rules page instead of a blocked upload while no rules are saved", () => {
    render(<AllowlistImport {...fixture()} contactType={null} hasSavedImport={false} snapshot={null} />);
    expect(screen.getByRole("heading", { name: ALLOWLIST_IMPORT_BROWSER_COPY.noPolicyTitle })).toBeVisible();
    expect(screen.getByRole("link", { name: ALLOWLIST_IMPORT_BROWSER_COPY.noPolicyAction })).toHaveAttribute("href", "/synthetic/academia/admissions/settings");
    expect(screen.queryByLabelText("Archivo CSV de habilitados")).not.toBeInTheDocument();
  });

  it("should render HTML as text, disable invalid rows and require explicit selection and confirmation", () => {
    const props = fixture(), { container } = render(<AllowlistImport {...props} />);
    expect(screen.getByText("<script>inert()</script>")).toBeVisible(); expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Seleccionar fila 2" })).toBeDisabled();
    // Without a chosen row the review step says why it cannot continue.
    expect(screen.getByText("Elegí al menos una fila válida para continuar.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar fila 1" })); expect(props.onSelectRow).toHaveBeenCalledWith(1, true); expect(props.onConfirm).not.toHaveBeenCalled();
  });
  it("should preserve row outcomes and offer only original recovery while a response is uncertain", () => {
    const props = fixture(); props.pending = true; props.selection = [1]; props.confirmed = true; props.step = 2;
    render(<AllowlistImport {...props} />);
    expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Importar filas elegidas" })).toBeDisabled();
    expect(screen.getByText("Primero consultá la operación original.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Consultar operación original" })); expect(props.onReadOriginal).toHaveBeenCalledOnce(); expect(props.onConfirm).not.toHaveBeenCalled();
  });
  it("should keep only the pressed preview busy while its write runs and disable the other import actions", () => {
    const props = fixture(); props.snapshot = null; props.hasSavedImport = false; props.confirmed = true; props.busy = true; props.pending = true; props.writeAction = "preview"; props.step = 0;
    render(<AllowlistImport {...props} />);
    expect(screen.getByRole("button", { name: "Crear vista previa" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Crear vista previa" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Descargar plantilla", hidden: true })).toBeDisabled();
    // The write in flight is not an unresolved original: no recovery competes with it.
    expect(screen.queryByRole("button", { name: "Consultar operación original" })).not.toBeInTheDocument();
  });
  it("should keep the resume label and progress while resuming pending rows even after the original is no longer resumable", () => {
    const props = fixture(); props.selection = [1]; props.busy = true; props.pending = true; props.canResume = false; props.writeAction = "resume"; props.step = 2;
    render(<AllowlistImport {...props} />);
    expect(screen.getByRole("button", { name: "Retomar filas pendientes" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Importar filas elegidas" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar progreso actual", hidden: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descargar reporte", hidden: true })).toBeDisabled();
  });
  it("should keep the pressed reconciliation mounted and busy while the earlier original is replayed", () => {
    const props = fixture(); props.busy = true; props.pending = true; props.unresolvedCount = 1; props.canReconcile = false; props.writeAction = "reconcile";
    render(<AllowlistImport {...props} />);
    expect(screen.getByRole("button", { name: "Conciliar resultados anteriores" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Importar filas elegidas" })).not.toBeInTheDocument();
  });
  it("should hide every prior contact and download control when current authority is lost", () => {
    const props = fixture(); props.privateVisible = false; props.errorMessage = "El acceso cambió.";
    render(<AllowlistImport {...props} />);
    expect(screen.queryByText("synthetic@example.test")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Descargar reporte" })).not.toBeInTheDocument(); expect(screen.getByRole("alert")).toBeVisible();
  });
  it("should explain the platform block before an upload and keep the import file and its preview out of reach", () => {
    const props = fixture(); props.snapshot = null; props.hasSavedImport = false; props.step = 0; props.platformRequirement = "security_unconfigured";
    render(<AllowlistImport {...props} />);
    const notice = screen.getByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title });
    expect(within(notice).getByText(PLATFORM_SECURITY_REQUIREMENT_COPY.security_unconfigured)).toBeVisible();
    expect(within(notice).getByText(ALLOWLIST_IMPORT_BROWSER_COPY.platformConsequence)).toBeVisible();
    expect(screen.getByLabelText("Archivo CSV de habilitados")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Confirmo guardar esta vista previa temporal/ })).toBeDisabled();
    expect(screen.getByText(ALLOWLIST_IMPORT_BROWSER_COPY.platformBlocked)).toBeVisible();
    fireEvent.click(within(notice).getByRole("button", { name: PLATFORM_SECURITY_NOTICE_COPY.recheck }));
    expect(props.onRecheckPlatform).toHaveBeenCalledOnce();
  });
  it("should keep the platform recheck waiting while another import read or write runs", () => {
    render(<AllowlistImport {...fixture()} snapshot={null} hasSavedImport={false} platformRequirement="recovery_locked" busy />);
    expect(screen.getByRole("button", { name: PLATFORM_SECURITY_NOTICE_COPY.recheck })).toBeDisabled();
  });
  it("should replace the rules link with the platform block when no rules can be saved either", () => {
    render(<AllowlistImport {...fixture()} contactType={null} hasSavedImport={false} snapshot={null} platformRequirement="recovery_locked" />);
    expect(screen.getByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title })).toBeVisible();
    expect(screen.queryByRole("link", { name: ALLOWLIST_IMPORT_BROWSER_COPY.noPolicyAction })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Archivo CSV de habilitados")).not.toBeInTheDocument();
  });
  it("should keep progress and reports readable but block importing and reconciling rows while the platform cannot protect them", () => {
    const props = fixture(); props.selection = [1]; props.confirmed = true; props.step = 2; props.unresolvedCount = 1; props.canReconcile = true; props.platformRequirement = "recovery_locked";
    render(<AllowlistImport {...props} />);
    expect(screen.getByRole("button", { name: "Importar filas elegidas" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Conciliar resultados anteriores" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Consultar operación original" })).toBeEnabled();
    expect(screen.getByText(ALLOWLIST_IMPORT_BROWSER_COPY.platformBlocked)).toBeVisible();
  });
  it("should offer to discard an original only after a consult proves it absent", () => {
    const props = fixture(); props.pending = true; props.step = 2;
    const { rerender } = render(<AllowlistImport {...props} />);
    expect(screen.queryByRole("button", { name: "Descartar la operación sin registrar" })).not.toBeInTheDocument();
    rerender(<AllowlistImport {...props} originalAbsent />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar la operación sin registrar" }));
    expect(props.onDiscardOriginal).toHaveBeenCalledOnce(); expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
