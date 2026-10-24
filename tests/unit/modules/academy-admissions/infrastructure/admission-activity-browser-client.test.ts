/** @vitest-environment node */
/** Exercises actual own snapshot transport and DTO guards without mocking the native SDK or schemas. @module admission-activity-browser-client-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionActivityApiClient } from "@/lib/academy-admissions/admission-activity-api-client";
import { createAdmissionActivityPageFixture } from "@/tests/support/admission-activity-page";

describe("private activity browser client", () => {
  it("should use one cancellable same-origin own read and preserve the exact microsecond cursor", async () => {
    const state = createAdmissionActivityPageFixture(), cursor = `2026-10-14T12:00:00.000999Z|${randomUUID()}`;
    state.selection.cursor = cursor;
    const transport = vi.fn<typeof fetch>(async () => Response.json(state));
    const client = createAdmissionActivityApiClient({ fetch: transport });
    const controller = new AbortController();
    const result = await client.read(state.slug, state.selection, controller.signal);
    expect(result.status).toBe("ready");
    expect(transport).toHaveBeenCalledOnce();
    const [path, options] = transport.mock.calls[0];
    expect(new URL(String(path), "https://app.example.test").searchParams.get("cursor")).toBe(cursor);
    expect(String(path).startsWith(`/api/tribes/${state.slug}/admissions/activity/snapshot?`)).toBe(true);
    expect(options).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal });
  });

  it("should reject a mismatched own route/selection and an incoherent same-page tribe binding", async () => {
    const state = createAdmissionActivityPageFixture(), transport = vi.fn<typeof fetch>(async () => Response.json(state));
    const client = createAdmissionActivityApiClient({ fetch: transport }), signal = new AbortController().signal;
    expect(await client.read("another-academy", state.selection, signal)).toMatchObject({ status: "failed", code: "public_contract_unusable" });
    expect(await client.read(state.slug, { limit: 10 }, signal)).toMatchObject({ status: "failed", code: "public_contract_unusable" });
    state.activity.tribeId = randomUUID();
    expect(await client.read(state.slug, state.selection, signal)).toMatchObject({ status: "failed", code: "public_contract_unusable" });
  });

  it("should avoid transport for invalid input or prior cancellation and keep network failures distinct", async () => {
    const transport = vi.fn<typeof fetch>(async () => { throw new Error(randomUUID()); });
    const client = createAdmissionActivityApiClient({ fetch: transport }), controller = new AbortController();
    expect(await client.read("synthetic-academy", { limit: 0 }, controller.signal)).toMatchObject({ status: "failed", code: "invalid_input" });
    expect(transport).not.toHaveBeenCalled();
    controller.abort();
    expect(await client.read("synthetic-academy", { limit: 25 }, controller.signal)).toEqual({ status: "aborted" });
    expect(transport).not.toHaveBeenCalled();
    expect(await client.read("synthetic-academy", { limit: 25 }, new AbortController().signal)).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: false });
  });
});
