/** Exercises secret-route reporting exclusion with real Next contexts and the installed provider boundary. @module private-aware-siteping-tests */
import { act, render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivateAwareSiteping } from "@/components/providers/private-aware-siteping";
import { isPrivateReportingLocation } from "@/lib/siteping/reporting-privacy";
import { AppProviders } from "@/components/providers/app-providers";

afterEach(() => vi.unstubAllGlobals());

describe("reporting tools on personal secret routes", () => {
  it("should keep private route hydration stable when reporting configuration differs between the static shell and runtime", async () => {
    const failures: unknown[] = [], container = document.createElement("div");
    const shell = (enabled: boolean) => <PathnameContext.Provider value="/admissions/invitations/synthetic-token"><SearchParamsContext.Provider value={new URLSearchParams()}><AppProviders isSitepingEnabled={enabled}><main>Contenido privado sintético</main></AppProviders></SearchParamsContext.Provider></PathnameContext.Provider>;
    container.innerHTML = renderToString(shell(true)); document.body.append(container);
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, shell(false), { onRecoverableError: (error) => failures.push(error) }); });
    expect(container.textContent).toContain("Contenido privado sintético"); expect(failures).toEqual([]);
    expect(document.querySelector("beezping-widget")).toBeNull();
    await act(async () => root.unmount()); container.remove();
  });

  it.each([
    ["/admissions/invitations/synthetic-token", ""],
    ["/auth/signin", "callbackUrl=%2Fadmissions%2Finvitations%2Fsynthetic-token"],
  ])("should avoid loading identity or the reporting widget on %s", async (pathname, query) => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => Response.json({ enabled: false, identity: null, projectName: "synthetic" })); vi.stubGlobal("fetch", fetcher);
    render(<PathnameContext.Provider value={pathname}><SearchParamsContext.Provider value={new URLSearchParams(query)}><PrivateAwareSiteping /></SearchParamsContext.Provider></PathnameContext.Provider>);
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled(); expect(document.querySelector("beezping-widget")).toBeNull();
  });

  it("should preserve reporting availability on ordinary routes with the real application identity adapter", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => Response.json({ enabled: false, identity: null, projectName: "synthetic" })); vi.stubGlobal("fetch", fetcher);
    const view = render(<PathnameContext.Provider value="/ordinary-academy"><SearchParamsContext.Provider value={new URLSearchParams()}><PrivateAwareSiteping /></SearchParamsContext.Provider></PathnameContext.Provider>);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    view.rerender(<PathnameContext.Provider value="/admissions/invitations/synthetic-token"><SearchParamsContext.Provider value={new URLSearchParams()}><PrivateAwareSiteping /></SearchParamsContext.Provider></PathnameContext.Provider>);
    expect(document.querySelector("beezping-widget")).toBeNull();
  });

  it("should classify private returns without exposing the token as a computed diagnostic", () => {
    expect(isPrivateReportingLocation("/auth/signin", new URLSearchParams({ callbackUrl: "/admissions/invitations/synthetic-token" }))).toBe(true);
    expect(isPrivateReportingLocation("/admissions/ordinary", new URLSearchParams())).toBe(false);
    expect(isPrivateReportingLocation("/auth/signin", new URLSearchParams({ callbackUrl: "/ordinary" }))).toBe(false);
  });
});
