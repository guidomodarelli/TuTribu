/** @vitest-environment node */
/** Exercises the real SSR/HTTP own input and DTO boundaries with only their application port substituted. @module admission-activity-page-http-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionActivityPageHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-activity-page-handler";
import { loadAdmissionActivityPageState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-activity-page";
import type { GetAdmissionActivityPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-activity-page-use-case";
import { createAdmissionActivityPageFixture } from "@/tests/support/admission-activity-page";

/** @returns Own guarded DTO data and an inward application read port, never a provider/SQL mock. */
function fixture() {
  const state = createAdmissionActivityPageFixture();
  const page = { execute: vi.fn<GetAdmissionActivityPageUseCase["execute"]>(async () => ({ ok: true, value: state })) };
  const open = vi.fn(async () => page);
  const handler = createAdmissionActivityPageHandler(open);
  const context = { params: Promise.resolve({ slug: state.slug }) };
  const request = (query = "") => new Request(`https://app.example.test/api/tribes/${state.slug}/admissions/activity/snapshot${query}`, { headers: { "x-request-id": randomUUID(), "x-trace-id": randomUUID() } });
  return { state, page, open, handler, context, request };
}

describe("private activity page boundaries", () => {
  it("should reject browser authority and malformed filters before opening HTTP or SSR composition", async () => {
    const data = fixture();
    expect((await data.handler(data.request("?role=leader"), data.context)).status).toBe(400);
    expect((await data.handler(data.request("?resourceId=invalid"), data.context)).status).toBe(400);
    expect((await data.handler(data.request("?cursor=invalid"), data.context)).status).toBe(400);
    expect(await loadAdmissionActivityPageState({ params: { slug: data.state.slug }, query: { actor: "foreign" } }, data.open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should publish the own safe composite with private headers and normalized bounded selection", async () => {
    const data = fixture(), request = data.request();
    const response = await data.handler(request, data.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data.state);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-request-id")).toBe(request.headers.get("x-request-id"));
    expect(response.headers.get("x-trace-id")).toBe(request.headers.get("x-trace-id"));
    expect(data.page.execute).toHaveBeenCalledWith(expect.objectContaining({ slug: data.state.slug, filters: { limit: 25 } }));
    const state = await loadAdmissionActivityPageState({ params: { slug: data.state.slug }, query: {} }, data.open);
    expect(state).toEqual(data.state);
  });

  it("should keep a current permission denial separate from a successful or partial private result", async () => {
    const data = fixture();
    data.page.execute.mockResolvedValue({ ok: false, failure: { code: "permission_denied" } });
    const response = await data.handler(data.request(), data.context);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "permission_denied" });
    expect(await loadAdmissionActivityPageState({ params: { slug: data.state.slug }, query: {} }, data.open)).toMatchObject({ kind: "unavailable", code: "permission_denied" });
  });

  it("should close an unusable own composite and contain unexpected causes without publishing private facts", async () => {
    const data = fixture(), marker = randomUUID();
    const capture = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      data.state.metrics.tribeId = randomUUID();
      const unusable = await data.handler(data.request(), data.context);
      expect(unusable.status).toBe(500);
      expect(await unusable.json()).toMatchObject({ code: "public_contract_unusable" });
      const state = await loadAdmissionActivityPageState({ params: { slug: data.state.slug }, query: {} }, async () => { throw new Error(marker); });
      expect(state).toMatchObject({ kind: "unavailable", code: "unexpected_failure" });
      expect(JSON.stringify(state).includes(marker)).toBe(false);
      expect(capture.mock.calls.some((argumentsList) => JSON.stringify(argumentsList).includes(marker))).toBe(false);
    } finally { capture.mockRestore(); }
  });
});
