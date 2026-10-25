/** @vitest-environment node */
/** Hung own routes end at the shared deadline in every academy browser adapter. @module browser-request-deadline-tests */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { boundBrowserRequest, startBrowserRequestDeadline } from "@/lib/browser-request-deadline";
import { createAdmissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { createAdmissionManagementBrowserTransport } from "@/lib/academy-admissions/admission-management-browser-transport";
import { createAdmissionNotificationSettingsApiClient } from "@/lib/academy-admissions/admission-notification-settings-api-client";
import { createMessagingBrowserRequest } from "@/lib/messaging/messaging-browser-api-client";
import { createMessagingUsageBrowserClient } from "@/lib/messaging/messaging-usage-api-client";
import { cancelAcademyRenewal, fetchOwnAcademyAccess, startAcademyCheckout } from "@/lib/academy/academy-api-client";
import { BROWSER_REQUEST_TIMEOUT_MESSAGE, BROWSER_REQUEST_TIMEOUT_MS } from "@/src/constants/browser-request";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";

const SLUG = "synthetic-academy";
const signedOutViewer = async () => ({ status: "ready" as const, value: null });

/** A native-like fetch whose response never arrives: it only settles when its signal aborts, as `fetch` does. */
function hungFetch() {
  return vi.fn<typeof globalThis.fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true });
  }));
}

/** Lets the deadline fire while the request is pending, then returns its settled result. */
async function afterDeadline<Value>(pending: Promise<Value>): Promise<Value> {
  await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS);
  return pending;
}

describe("browser request deadline", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("fires only after the configured wait and remembers that it did", async () => {
    const deadline = startBrowserRequestDeadline(new AbortController().signal);

    await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS - 1);
    expect(deadline.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.expired()).toBe(true);
  });

  it("follows the caller's cancellation without reporting it as an expired deadline", async () => {
    const caller = new AbortController();
    const deadline = startBrowserRequestDeadline(caller.signal);

    caller.abort();
    await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.expired()).toBe(false);
  });

  it("never fires once the request settled and was disposed", async () => {
    const deadline = startBrowserRequestDeadline(new AbortController().signal);

    deadline.dispose();
    await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS);
    expect(deadline.signal.aborted).toBe(false);
  });

  it("keeps a settled result even when it carries an aborted status of its own", async () => {
    const caller = new AbortController();
    type Observed = { status: "aborted" } | { status: "timedOut" };
    const pending = boundBrowserRequest<Observed>(caller.signal, async () => { caller.abort(); return { status: "aborted" }; }, () => ({ status: "timedOut" }));

    await expect(pending).resolves.toEqual({ status: "aborted" });
  });

  describe("admission browser API", () => {
    it("ends a hung write as an uncertain timeout so its original is recovered instead of repeated", async () => {
      const fetch = hungFetch();
      const client = createAdmissionApiClient({ fetch, viewer: signedOutViewer });

      const result = await afterDeadline(client.submit(SLUG, { operationId: randomUUID(), confirmed: true, expectedPolicyVersion: 1 }, new AbortController().signal));

      expect(result).toEqual({ status: "failed", code: ADMISSION_ERROR_CODE.transportTimeout, message: BROWSER_REQUEST_TIMEOUT_MESSAGE, uncertain: true });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("ends a hung read as a certain timeout", async () => {
      const client = createAdmissionApiClient({ fetch: hungFetch(), viewer: signedOutViewer });

      await expect(afterDeadline(client.overview(SLUG, new AbortController().signal))).resolves.toMatchObject({ status: "failed", code: ADMISSION_ERROR_CODE.transportTimeout, uncertain: false });
    });

    it("keeps the caller's own cancellation an abort", async () => {
      const client = createAdmissionApiClient({ fetch: hungFetch(), viewer: signedOutViewer });
      const caller = new AbortController();
      const pending = client.reviewList(SLUG, null, caller.signal);

      caller.abort();
      await expect(pending).resolves.toEqual({ status: "aborted" });
    });

    it("ends a hung account change, which never commits a write", async () => {
      const client = createAdmissionApiClient({ fetch: hungFetch(), viewer: signedOutViewer });

      await expect(afterDeadline(client.changeAccount(new AbortController().signal))).resolves.toMatchObject({ status: "failed", code: ADMISSION_ERROR_CODE.transportTimeout, uncertain: false });
    });

    it("ends hung management and notification setting writes as uncertain timeouts", async () => {
      const transport = createAdmissionManagementBrowserTransport(hungFetch());
      const settings = createAdmissionNotificationSettingsApiClient({ fetch: hungFetch(), viewer: signedOutViewer });
      const operationId = randomUUID();

      await expect(afterDeadline(transport.json("/api/tribes/synthetic-academy/admissions/allowlist", z.object({}), new AbortController().signal, { operationId }))).resolves.toEqual({ status: "failed", code: ADMISSION_ERROR_CODE.transportTimeout, message: BROWSER_REQUEST_TIMEOUT_MESSAGE, uncertain: true });
      await expect(afterDeadline(settings.readPreference(SLUG, new AbortController().signal))).resolves.toMatchObject({ status: "failed", code: ADMISSION_ERROR_CODE.transportTimeout, uncertain: false });
    });
  });

  describe("messaging browser API", () => {
    it("ends a hung connection write as an uncertain messaging timeout", async () => {
      const request = createMessagingBrowserRequest(hungFetch());

      await expect(afterDeadline(request("/api/tribes/synthetic-academy/messaging/connections", z.object({}), new AbortController().signal, { method: "POST", input: { operationId: randomUUID() } }))).resolves.toEqual({ status: "failed", code: MESSAGING_ERROR_CODE.transportTimeout, message: MESSAGING_ERROR_MESSAGE[MESSAGING_ERROR_CODE.transportTimeout], uncertain: true });
    });

    it("ends a hung usage read as a certain messaging timeout", async () => {
      const client = createMessagingUsageBrowserClient({ fetch: hungFetch(), viewer: signedOutViewer });

      await expect(afterDeadline(client.read(SLUG, new AbortController().signal))).resolves.toMatchObject({ status: "failed", code: MESSAGING_ERROR_CODE.transportTimeout, uncertain: false });
    });
  });

  describe("academy browser API", () => {
    it("ends a hung checkout with the timeout copy instead of leaving it open", async () => {
      vi.stubGlobal("fetch", hungFetch());

      await expect(afterDeadline(startAcademyCheckout(SLUG, 3))).resolves.toEqual({ isSuccess: false, message: BROWSER_REQUEST_TIMEOUT_MESSAGE, status: 0 });
    });

    it("never reports success when the response body stalls past the deadline", async () => {
      // Headers arrive, then the body stops streaming; as native fetch does, the abort errors the body stream.
      vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>((_input, init) => Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("The operation was aborted.", "AbortError")), { once: true });
        },
      }), { status: 200, headers: { "content-type": "application/json" } }))));

      await expect(afterDeadline(cancelAcademyRenewal(SLUG))).resolves.toEqual({ isSuccess: false, message: BROWSER_REQUEST_TIMEOUT_MESSAGE, status: 0 });
    });

    it("keeps a caller's cancellation on the existing fallback", async () => {
      vi.stubGlobal("fetch", hungFetch());
      const caller = new AbortController();
      const pending = fetchOwnAcademyAccess(SLUG, caller.signal);

      caller.abort();
      await expect(pending).resolves.toMatchObject({ isSuccess: false, status: 0 });
      await expect(pending).resolves.not.toMatchObject({ message: BROWSER_REQUEST_TIMEOUT_MESSAGE });
    });
  });
});
