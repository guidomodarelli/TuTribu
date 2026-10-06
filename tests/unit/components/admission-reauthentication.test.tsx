/** Exercises the real presenter/container with an owned browser transport port. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReauthenticationContainer } from "@/app/auth/reauthenticate/reauthentication-container";
import type { ReauthenticationBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-browser-client";
import type { ReauthenticationIntentResult } from "@/src/modules/auth/application/results/reauthentication-intent-result";

const intent: ReauthenticationIntentResult = { intentId: "20ca5bf6-8517-4e0d-a7d7-24144fcb0ea8", state: "created", outcome: "pending", safeMessage: "Confirmá tu autenticación con Google para continuar.", returnPath: "/synthetic-tribe" };

/** Replaces only the application's own transport boundary, never React or the SDK. */
function createClient(): ReauthenticationBrowserClient {
  return { start: vi.fn(async () => ({ status: "started" as const })), read: vi.fn(async () => ({ status: "ready" as const, intent })) };
}

describe("global reauthentication screen", () => {
  afterEach(() => vi.useRealTimers());
  it("should preserve an existing session and await explicit Google confirmation", async () => {
    const client = createClient();
    render(<ReauthenticationContainer initialState={{ kind: "ready", intent, oauthFailed: false }} client={client} />);
    expect(screen.getByRole("heading", { name: "Confirmá tu autenticación" })).toBeVisible();
    expect(client.start).not.toHaveBeenCalled();
    expect(client.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar con Google" }));
    await waitFor(() => expect(client.start).toHaveBeenCalledOnce());
    expect(client.start).toHaveBeenCalledWith(intent.intentId, expect.any(AbortSignal));
    expect(screen.queryByRole("link", { name: "Continuar con la acción" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redirigiendo a Google…" })).toBeDisabled();
  });

  it("should block repeated starts and show verified state only after an owned read", async () => {
    const client = createClient();
    let resolveStart!: (value: { status: "started" }) => void;
    vi.mocked(client.start).mockImplementation(() => new Promise((resolve) => { resolveStart = resolve; }));
    vi.mocked(client.read).mockResolvedValue({ status: "ready", intent: { ...intent, state: "consumed", outcome: "verified", validUntil: new Date(Date.now() + 60_000).toISOString(), safeMessage: "Tu autenticación reciente está confirmada para esta acción." } });
    render(<ReauthenticationContainer initialState={{ kind: "ready", intent, oauthFailed: false }} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar con Google" }));
    fireEvent.click(screen.getByRole("button", { name: "Redirigiendo a Google…" }));
    expect(client.start).toHaveBeenCalledOnce();
    await act(async () => resolveStart({ status: "started" }));
    fireEvent(window, Object.assign(new Event("pageshow"), { persisted: true }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Continuar con la acción" })).toHaveAttribute("href", intent.returnPath));
    expect(client.read).toHaveBeenCalledOnce();
  });

  it.each([
    { state: "consumed" as const, outcome: "reauthentication_required" as const, safeMessage: "No pudimos acreditar una autenticación reciente. Volvé a intentarlo." },
    { state: "expired" as const, outcome: "expired" as const, safeMessage: "La solicitud de autenticación venció. Iniciá una nueva." },
  ])("should keep $outcome insufficient without starting another OAuth mutation", ({ state, outcome, safeMessage }) => {
    const client = createClient();
    render(<ReauthenticationContainer initialState={{ kind: "ready", intent: { ...intent, state, outcome, safeMessage }, oauthFailed: false }} client={client} />);
    expect(screen.getByText(safeMessage)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirmar con Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continuar con la acción" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a la tribu" })).toHaveAttribute("href", intent.returnPath);
    expect(client.start).not.toHaveBeenCalled();
  });

  it("should clear a read error before retry without repeating the OAuth start", async () => {
    const client = createClient();
    vi.mocked(client.read).mockResolvedValueOnce({ status: "failed", code: "unexpected_failure" });
    let resolveRead!: (value: { status: "ready"; intent: ReauthenticationIntentResult }) => void;
    vi.mocked(client.read).mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    render(<ReauthenticationContainer initialState={{ kind: "ready", intent: { ...intent, state: "authorizing" }, oauthFailed: false }} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar el resultado"));
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultando estado…" })).toBeDisabled();
    await act(async () => resolveRead({ status: "ready", intent: { ...intent, state: "consumed", outcome: "reauthentication_required" } }));
    expect(client.start).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Continuar con la acción" })).not.toBeInTheDocument();
  });

  it("should cancel an in-flight read when the screen unmounts", async () => {
    const client = createClient();
    let signal!: AbortSignal;
    vi.mocked(client.read).mockImplementation(async (_intentId, requestSignal) => {
      signal = requestSignal;
      return await new Promise((resolve) => requestSignal.addEventListener("abort", () => resolve({ status: "aborted" }), { once: true }));
    });
    const view = render(<ReauthenticationContainer initialState={{ kind: "ready", intent: { ...intent, state: "authorizing" }, oauthFailed: false }} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it("should require a read before retrying an ambiguous OAuth start", async () => {
    const client = createClient();
    vi.mocked(client.start).mockResolvedValue({ status: "failed", code: "unexpected_failure" });
    vi.mocked(client.read).mockResolvedValue({ status: "ready", intent: { ...intent, state: "authorizing" } });
    render(<ReauthenticationContainer initialState={{ kind: "ready", intent, oauthFailed: false }} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar con Google" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Consultá el estado antes de volver a intentarlo"));
    expect(screen.getByRole("button", { name: "Confirmar con Google" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirmar con Google" })).not.toBeInTheDocument());
    expect(client.start).toHaveBeenCalledOnce();
    expect(client.read).toHaveBeenCalledOnce();
  });

  it("should withdraw a verified display when current ownership becomes unavailable", async () => {
    const client = createClient();
    vi.mocked(client.read).mockResolvedValue({ status: "failed", code: "context_unavailable" });
    render(<ReauthenticationContainer initialState={{ kind: "ready", intent: { ...intent, state: "consumed", outcome: "verified", validUntil: new Date(Date.now() + 60_000).toISOString() }, oauthFailed: false }} client={client} />);
    expect(screen.getByRole("link", { name: "Continuar con la acción" })).toBeVisible();
    fireEvent(window, Object.assign(new Event("pageshow"), { persisted: true }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "No podemos confirmar esta acción" })).toBeVisible());
    expect(screen.queryByRole("link", { name: "Continuar con la acción" })).not.toBeInTheDocument();
  });

  it("should withdraw an expired confirmation and reconcile without another OAuth start", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const client = createClient();
    const verifiedIntent: ReauthenticationIntentResult = { ...intent, state: "consumed", outcome: "verified", validUntil: new Date(Date.now() + 1_000).toISOString(), safeMessage: "Tu autenticación reciente está confirmada para esta acción." };
    vi.mocked(client.read).mockResolvedValue({ status: "ready", intent: { ...verifiedIntent, outcome: "reauthentication_required", safeMessage: "No pudimos acreditar una autenticación reciente. Volvé a intentarlo." } });
    render(<ReauthenticationContainer initialState={{ kind: "ready", intent: verifiedIntent, oauthFailed: false }} client={client} />);
    expect(screen.getByRole("link", { name: "Continuar con la acción" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Consultar estado" })).toBeEnabled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.queryByRole("link", { name: "Continuar con la acción" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Confirmá tu autenticación" })).toBeVisible();
    expect(client.read).toHaveBeenCalledOnce();
    expect(client.start).not.toHaveBeenCalled();
  });

  it("should not revive an expired confirmation from a late read result", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const client = createClient();
    const verifiedIntent: ReauthenticationIntentResult = { ...intent, state: "consumed", outcome: "verified", validUntil: new Date(Date.now() + 1_000).toISOString(), safeMessage: "Tu autenticación reciente está confirmada para esta acción." };
    vi.mocked(client.read).mockResolvedValue({ status: "ready", intent: verifiedIntent });
    render(<ReauthenticationContainer initialState={{ kind: "ready", intent: verifiedIntent, oauthFailed: false }} client={client} />);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.queryByRole("link", { name: "Continuar con la acción" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No pudimos acreditar una autenticación reciente");
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(client.read).toHaveBeenCalledOnce();
    expect(client.start).not.toHaveBeenCalled();
  });

  it("should keep server markup and the first hydrated render identical", async () => {
    const client = createClient();
    const tree = <ReauthenticationContainer initialState={{ kind: "ready", intent, oauthFailed: false }} client={client} />;
    const host = document.createElement("div");
    host.innerHTML = renderToString(tree);
    document.body.append(host);
    const errors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(host, tree, { onRecoverableError: (error) => errors.push(error) }); });
    expect(errors).toEqual([]);
    expect(host.querySelector("h1")).toHaveTextContent("Confirmá tu autenticación");
    expect(client.read).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });
});
