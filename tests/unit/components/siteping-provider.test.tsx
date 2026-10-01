import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Toaster } from "beez-ui";
import { SitepingProvider } from "@/components/providers/siteping-provider";

const identity = {
  enabled: true,
  identity: { email: "leader@example.com", name: "Leader Example" },
  projectName: "tutribu",
};

/** Answers only the application's HTTP boundary; the widget package is real. */
function serveIdentity(snapshot: unknown) {
  const request = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return Response.json(url.includes("/identity") ? snapshot : { feedbacks: [], total: 0 });
  });
  vi.stubGlobal("fetch", request);
  return request;
}

describe("SitepingProvider with the published Beezping widget", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

  it("should keep the widget absent when the server denies access", async () => {
    const request = serveIdentity({ ...identity, enabled: false, identity: null });
    render(<SitepingProvider />);
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(document.querySelector("beezping-widget")).toBeNull();
  });

  it("should mount the real Beezping host for an authorized identity and remove it on unmount", async () => {
    serveIdentity(identity);
    const view = render(<SitepingProvider />);
    await waitFor(() => expect(document.querySelector("beezping-widget")).not.toBeNull());
    view.unmount();
    expect(document.querySelector("beezping-widget")).toBeNull();
  });

  it("should abort the identity request when the provider unmounts", async () => {
    const request = vi.fn((_input: RequestInfo | URL, _options?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", request);
    const view = render(<SitepingProvider />);
    await waitFor(() => expect(request).toHaveBeenCalled());
    const options = request.mock.calls[0]?.[1] as RequestInit | undefined;
    view.unmount();
    expect(options?.signal?.aborted).toBe(true);
  });
  it("should reject a malformed public identity instead of mounting the widget", async () => {
    serveIdentity({ ...identity, enabled: "yes" });
    render(<><SitepingProvider /><Toaster /></>);
    await screen.findByText("No pudimos cargar las herramientas para reportar problemas.");
    expect(document.querySelector("beezping-widget")).toBeNull();
  });

  it("should retry a failed identity read and clear its feedback once access is loaded", async () => {
    const request = vi.fn(async () => Response.json({ feedbacks: [], total: 0 }));
    request.mockResolvedValueOnce(new Response(null, { status: 503 }));
    request.mockResolvedValueOnce(Response.json(identity));
    vi.stubGlobal("fetch", request);
    render(<><SitepingProvider /><Toaster /></>);
    await screen.findByText("No pudimos cargar las herramientas para reportar problemas.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(document.querySelector("beezping-widget")).not.toBeNull());
    await waitFor(() => expect(screen.queryByText("No pudimos cargar las herramientas para reportar problemas.")).toBeNull());
  });

});
