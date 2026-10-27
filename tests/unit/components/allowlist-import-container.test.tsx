/** Exercises the actual import container: a changed account behind the page and choosing every valid row at once. @module allowlist-import-container-tests */
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllowlistImportContainer } from "@/app/(platform)/[slug]/academia/admissions/allowlist/allowlist-import-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";
import { ALLOWLIST_IMPORT_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { writeAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";
import { changeGuidedStep } from "@/tests/support/guided-steps";

const router = { back: vi.fn(), bfcacheId: "allowlist-import-container-tests", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** @param props - Actual UI children. @returns Native framework context and unmocked shared components. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

/** @returns A current import page whose own browser port answers with another account. */
function fixture() {
  const state: Extract<AllowlistImportPageState, { kind: "ready" }> = { kind: "ready", slug: "synthetic-academy", tribeId: randomUUID(), viewerId: randomUUID(), renderedAt: "2026-10-09T08:00:00Z", contactType: "email", policyVersion: 1 };
  const unused = async () => ({ status: "failed" as const, code: "resource_unavailable" as const, message: "Recurso no disponible.", uncertain: false });
  const client: AllowlistImportBrowserClient = {
    viewer: vi.fn<AllowlistImportBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: randomUUID() } })),
    operation: vi.fn(unused), policy: vi.fn(unused), read: vi.fn(unused), write: vi.fn(unused), file: vi.fn(unused),
  };
  return { state, client };
}

describe("allowlist import container", () => {
  it("should close the private import and offer a way back when another account is now signed in", async () => {
    const data = fixture();
    render(<AllowlistImportContainer initialState={data.state} client={data.client} />, { wrapper: Providers });

    expect(await screen.findByRole("alert")).toHaveTextContent(ALLOWLIST_IMPORT_BROWSER_COPY.account);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Descargar/ })).not.toBeInTheDocument();
    expect(data.client.write).not.toHaveBeenCalled();
  });
});

describe("allowlist import selection", () => {
  afterEach(() => window.sessionStorage.clear());
  /** Rows past the 50 shown per page, with invalid rows and rows that already have a result. */
  const ROW_COUNT = 120, INVALID_EVERY = 10, WITH_RESULT = new Set([1, 2]);

  /** @returns A saved import of the current viewer whose rows span several pages, and own ports that read it. */
  function savedImport() {
    const viewerId = randomUUID(), importId = randomUUID();
    const state: Extract<AllowlistImportPageState, { kind: "ready" }> = { kind: "ready", slug: "synthetic-academy", tribeId: randomUUID(), viewerId, renderedAt: new Date().toISOString(), contactType: "email", policyVersion: 1 };
    const rows: AllowlistImportDto["rows"] = Array.from({ length: ROW_COUNT }, (_row, index) => {
      const rowNumber = index + 1, base = { rowNumber, identity: `fila-${rowNumber}@example.test`, displayName: null, selected: false };
      if (WITH_RESULT.has(rowNumber)) return { ...base, errors: [], outcome: "added" as const, version: 1 };
      return { ...base, errors: rowNumber % INVALID_EVERY === 0 ? ["admission_contact_invalid" as const] : [] };
    });
    const snapshot: AllowlistImportDto = { importId, state: "processing", sourceVersion: 2, expiresAt: new Date(Date.now() + ADMISSION_LIMIT.csvRetentionMs).toISOString(), counts: { selected: 0, added: WITH_RESULT.size, unchanged: 0, skipped: 0, conflict: 0 }, rows };
    const client: AllowlistImportBrowserClient = {
      viewer: vi.fn<AllowlistImportBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
      read: vi.fn<AllowlistImportBrowserClient["read"]>(async () => ({ status: "ready", value: snapshot })),
      write: vi.fn<AllowlistImportBrowserClient["write"]>(async () => ({ status: "failed", code: "dependency_unavailable", message: "No pudimos importar las filas.", uncertain: false })),
      operation: vi.fn(), policy: vi.fn(), file: vi.fn(),
    };
    writeAllowlistImport({ viewerId, slug: state.slug, draft: null, importId, selection: [], pending: null, unresolved: [] });
    const valid = rows.filter((row) => row.errors.length === 0 && row.outcome === undefined).map((row) => row.rowNumber);
    return { state, client, valid };
  }
  /** @param term - Count label of the review step. @returns Its value on screen. */
  function count(term: string) { return screen.getByText(term).nextElementSibling?.textContent; }

  it("should choose every valid row without a result in one action, clear them in another and import exactly those rows", async () => {
    const data = savedImport();
    render(<AllowlistImportContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const selectAll = await screen.findByRole("button", { name: "Seleccionar todas las válidas" });
    await waitFor(() => expect(selectAll).toBeEnabled());
    expect(count("Válidas sin resultado")).toBe(String(data.valid.length));
    expect(count("Elegidas ahora")).toBe("0");
    expect(screen.getByRole("button", { name: "Quitar selección" })).toBeDisabled();

    fireEvent.click(selectAll);
    expect(count("Elegidas ahora")).toBe(String(data.valid.length));
    // Rows with errors or with a result stay unchosen, as they would one by one.
    expect(screen.getByRole("checkbox", { name: "Seleccionar fila 3" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Seleccionar fila 1" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Seleccionar fila 10" })).not.toBeChecked();
    expect(selectAll).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Quitar selección" }));
    expect(count("Elegidas ahora")).toBe("0");
    expect(screen.getByRole("checkbox", { name: "Seleccionar fila 3" })).not.toBeChecked();

    fireEvent.click(selectAll);
    await changeGuidedStep(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(`Vas a incorporar ${data.valid.length} filas elegidas.`)).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo incorporar sólo las filas elegidas" }));
    fireEvent.click(screen.getByRole("button", { name: "Importar filas elegidas" }));
    await waitFor(() => expect(data.client.write).toHaveBeenCalledOnce());
    expect(vi.mocked(data.client.write).mock.calls[0][1]).toMatchObject({ type: "confirm_allowlist_import", selectedRows: data.valid });
    await waitFor(() => expect(screen.getByRole("button", { name: "Importar filas elegidas" })).not.toHaveAttribute("aria-busy"));
  });
});
