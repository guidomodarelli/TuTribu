/** Exercises the actual import container when the account behind the page is no longer the one that read it. @module allowlist-import-container-tests */
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it, vi } from "vitest";
import { AllowlistImportContainer } from "@/app/(platform)/[slug]/academia/admissions/allowlist/allowlist-import-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import { ALLOWLIST_IMPORT_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";

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
