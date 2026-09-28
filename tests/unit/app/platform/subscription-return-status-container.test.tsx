import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { SubscriptionReturnStatusContainer } from "@/app/(platform)/[slug]/subscription-return-status-container";
import * as browserNavigation from "@/lib/browser-navigation";

// `window.location` cannot be replaced in jsdom, so the navigation helpers
// (the project's own border with the browser location) are observed instead.
vi.mock("@/lib/browser-navigation", () => ({
  reloadCurrentPage: vi.fn(),
  replaceCurrentPageWithUrl: vi.fn(),
}));

const TRIBE_SLUG = "matematica-pro";
const PREAPPROVAL_ID = "2c9380848f1b4c3e";
const STATUS_ENDPOINT = `/api/tribes/${TRIBE_SLUG}/subscriptions/return-status?preapproval_id=${PREAPPROVAL_ID}`;
const RETURN_PATH = `/${TRIBE_SLUG}?preapproval_id=${PREAPPROVAL_ID}`;
const BACKOFF_DELAYS_MS = [3_000, 6_000, 12_000, 24_000, 30_000, 30_000, 30_000, 30_000];

const fetchMock = globalThis.fetch as Mock;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function respondAlways(body: unknown, status = 200) {
  fetchMock.mockImplementation(async () => jsonResponse(body, status));
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function setDocumentVisibility(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: visibilityState,
  });
}

function renderContainer() {
  return render(
    <SubscriptionReturnStatusContainer
      providerSubscriptionId={PREAPPROVAL_ID}
      tribeSlug={TRIBE_SLUG}
    />
  );
}

describe("SubscriptionReturnStatusContainer", () => {
  beforeEach(() => {
    // Exact backoff boundaries need a clock that only moves when the test
    // advances it (the shared config lets fake time follow real time).
    vi.useFakeTimers({
      shouldAdvanceTime: false,
      toFake: ["setTimeout", "clearTimeout", "Date"],
    });
    fetchMock.mockReset();
    vi.mocked(browserNavigation.replaceCurrentPageWithUrl).mockReset();
    vi.mocked(browserNavigation.reloadCurrentPage).mockReset();
    setDocumentVisibility("visible");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    setDocumentVisibility("visible");
  });

  it("polls the status endpoint instead of reloading the document", async () => {
    respondAlways({ status: "pending" });
    renderContainer();

    await advance(2_999);
    expect(fetchMock).not.toHaveBeenCalled();

    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      STATUS_ENDPOINT,
      expect.objectContaining({ cache: "no-store" })
    );
    expect(browserNavigation.reloadCurrentPage).not.toHaveBeenCalled();
    expect(browserNavigation.replaceCurrentPageWithUrl).not.toHaveBeenCalled();
  });

  it("backs off exponentially between checks up to a 30 second ceiling", async () => {
    respondAlways({ status: "pending" });
    renderContainer();

    for (const [attemptIndex, delayMs] of BACKOFF_DELAYS_MS.slice(0, 5).entries()) {
      await advance(delayMs - 1);
      expect(fetchMock).toHaveBeenCalledTimes(attemptIndex);

      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(attemptIndex + 1);
    }
  });

  it("stops after the attempt cap and offers a manual refresh", async () => {
    respondAlways({ status: "pending" });
    renderContainer();

    for (const delayMs of BACKOFF_DELAYS_MS) {
      await advance(delayMs);
    }

    expect(fetchMock).toHaveBeenCalledTimes(BACKOFF_DELAYS_MS.length);
    expect(
      screen.getByRole("heading", { name: "Todavía no recibimos la confirmación" })
    ).toBeInTheDocument();

    await advance(10 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(BACKOFF_DELAYS_MS.length);

    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(BACKOFF_DELAYS_MS.length + 1);
    expect(
      screen.getByRole("heading", { name: "Estamos confirmando tu suscripción" })
    ).toBeInTheDocument();
  });

  it("keeps backing off when a check fails and still honors the cap", async () => {
    respondAlways({ message: "No pudimos confirmar tu suscripción." }, 503);
    renderContainer();

    for (const delayMs of BACKOFF_DELAYS_MS) {
      await advance(delayMs);
    }

    expect(fetchMock).toHaveBeenCalledTimes(BACKOFF_DELAYS_MS.length);
    expect(
      screen.getByRole("button", { name: "Actualizar estado" })
    ).toBeInTheDocument();
  });

  it("navigates to the resolved destination and stops polling", async () => {
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ status: "pending" }))
      .mockImplementationOnce(async () =>
        jsonResponse({ redirectPath: `/${TRIBE_SLUG}/bienvenida`, status: "resolved" })
      );
    renderContainer();

    await advance(3_000);
    await advance(6_000);

    expect(browserNavigation.replaceCurrentPageWithUrl).toHaveBeenCalledWith(
      `/${TRIBE_SLUG}/bienvenida`
    );

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hands a lost session back to the tribe page so it can ask to sign in", async () => {
    respondAlways({ message: "Iniciá sesión para confirmar tu suscripción." }, 401);
    renderContainer();

    await advance(3_000);

    expect(browserNavigation.replaceCurrentPageWithUrl).toHaveBeenCalledWith(RETURN_PATH);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never navigates to a destination outside the app", async () => {
    respondAlways({ redirectPath: "//evil.example/phish", status: "resolved" });
    renderContainer();

    await advance(3_000);

    expect(browserNavigation.replaceCurrentPageWithUrl).not.toHaveBeenCalled();

    await advance(6_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts the in-flight check and stops polling on unmount", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );
    const { unmount } = renderContainer();

    await advance(3_000);
    const requestSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal;

    expect(requestSignal?.aborted).toBe(false);

    unmount();

    expect(requestSignal?.aborted).toBe(true);

    await advance(10 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(browserNavigation.replaceCurrentPageWithUrl).not.toHaveBeenCalled();
  });

  it("pauses while the tab is hidden and checks again when it becomes visible", async () => {
    respondAlways({ status: "pending" });
    renderContainer();

    setDocumentVisibility("hidden");
    await advance(3_000);
    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();

    setDocumentVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
