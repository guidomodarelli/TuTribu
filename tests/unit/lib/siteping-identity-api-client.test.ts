import { beforeEach, describe, expect, it, type Mock } from "vitest";

import {
  SITEPING_IDENTITY_FAILURE_REASON,
  SITEPING_IDENTITY_REQUEST_RESULT,
  fetchSitepingIdentityRequest,
} from "@/lib/siteping/siteping-identity-api-client";

const identity = {
  enabled: true,
  identity: { email: "leader@example.com", name: "Leader Example" },
  projectName: "tutribu",
};

describe("fetchSitepingIdentityRequest", () => {
  beforeEach(() => {
    (global.fetch as Mock).mockReset();
  });

  it("should return the validated public identity and forward the abort signal", async () => {
    (global.fetch as Mock).mockResolvedValue(Response.json({ ...identity, extra: "dropped" }));
    const controller = new AbortController();

    const result = await fetchSitepingIdentityRequest({ signal: controller.signal });

    expect(result).toEqual({ identity, kind: SITEPING_IDENTITY_REQUEST_RESULT.loaded });
    expect((global.fetch as Mock).mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it.each([401, 403])("should report denied access for HTTP %i without parsing the body", async (status) => {
    (global.fetch as Mock).mockResolvedValue(new Response("not json", { status }));

    const result = await fetchSitepingIdentityRequest({ signal: new AbortController().signal });

    expect(result).toEqual({ kind: SITEPING_IDENTITY_REQUEST_RESULT.denied });
  });

  it("should report an unusable public identity as a rejected DTO", async () => {
    (global.fetch as Mock).mockResolvedValue(Response.json({ ...identity, enabled: "yes" }));

    const result = await fetchSitepingIdentityRequest({ signal: new AbortController().signal });

    expect(result).toEqual({
      kind: SITEPING_IDENTITY_REQUEST_RESULT.failed,
      reason: SITEPING_IDENTITY_FAILURE_REASON.publicDtoRejected,
    });
  });

  it("should report an error status with its HTTP status", async () => {
    (global.fetch as Mock).mockResolvedValue(new Response(null, { status: 503 }));

    const result = await fetchSitepingIdentityRequest({ signal: new AbortController().signal });

    expect(result).toEqual({
      kind: SITEPING_IDENTITY_REQUEST_RESULT.failed,
      reason: SITEPING_IDENTITY_FAILURE_REASON.httpStatus,
      status: 503,
    });
  });

  it("should report a network failure instead of throwing", async () => {
    (global.fetch as Mock).mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await fetchSitepingIdentityRequest({ signal: new AbortController().signal });

    expect(result).toEqual({
      kind: SITEPING_IDENTITY_REQUEST_RESULT.failed,
      reason: SITEPING_IDENTITY_FAILURE_REASON.network,
    });
  });
});
