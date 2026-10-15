/** @vitest-environment node */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type NeonApiClient = {
  callNeonApi: (request: {
    apiKey: string;
    method: string;
    path: string;
    operation: string;
  }) => Promise<unknown>;
};

const NEON_REQUEST = {
  apiKey: "neon-api-key",
  method: "DELETE",
  operation: "neon-api-client-test:deleteBranch",
  path: "/projects/project-id/branches/br-sandbox",
};

let neonApiClient: NeonApiClient;

describe("neon api client", () => {
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    neonApiClient = (await import(
      "../../../scripts/neon/neon-api-client.mjs"
    )) as unknown as NeonApiClient;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should treat a successful response without body, like a 204 delete of a missing branch, as empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(neonApiClient.callNeonApi(NEON_REQUEST)).resolves.toEqual({});
  });

  it("should parse a successful JSON body", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ branch: { id: "br-sandbox" } }));

    await expect(neonApiClient.callNeonApi(NEON_REQUEST)).resolves.toEqual({
      branch: { id: "br-sandbox" },
    });
  });

  it("should report the operation, method, path and status without the API key", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("forbidden", { status: 403 }));

    const failure = neonApiClient.callNeonApi(NEON_REQUEST);

    await expect(failure).rejects.toThrow(
      "neon-api-client-test:deleteBranch failed: DELETE /projects/project-id/branches/br-sandbox -> HTTP 403"
    );
    await expect(failure).rejects.not.toThrow(/neon-api-key/);
  });
});
