jest.mock("server-only", () => ({}));

import { CloudflareImagesSitepingScreenshotStorage } from "@/src/modules/siteping/infrastructure/cloudflare/cloudflare-images-siteping-screenshot-storage";
import type { HttpFetcher, HttpResponse } from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

const VALID_SCREENSHOT_DATA_URL = "data:image/jpeg;base64,SGVsbG8=";
const UPLOAD_ENDPOINT =
  "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1";
const STORED_DELIVERY_URL =
  "https://imagedelivery.net/account-hash/image-1/public";
const DELETE_ENDPOINT =
  "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/image-1";
const RESERVED_IMAGE_ID = "reserved-image-1";
const RESERVED_IMAGE_RESOURCE_URL =
  "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/reserved-image-1";
const RESERVED_DELIVERY_URL =
  "https://imagedelivery.net/account-hash/reserved-image-1/public";
const HTTP_METHOD = { delete: "DELETE", post: "POST" } as const;
/**
 * Mirrors `SCREENSHOT_UPLOAD_RESILIENCE.timeoutMs` in the storage adapter, which
 * also bounds the upload body read. Advancing fake timers by this budget fires
 * the stalled-body fallback.
 */
const SCREENSHOT_UPLOAD_TIMEOUT_MS = 5000;
/**
 * Cloudflare rejects a custom image id that is in UUID format with "Custom ID is
 * not valid: Must not be UUID", so the default-generated id pinned on the upload
 * must never match this shape.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOUDFLARE_MAX_CUSTOM_ID_LENGTH = 32;

function configureCloudflareImagesEnvironment() {
  process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH = "account-hash";
  process.env.CLOUDFLARE_ACCOUNT_ID = "account-id";
  process.env.CLOUDFLARE_IMAGES_API_TOKEN = "api-token";
  process.env.CLOUDFLARE_IMAGES_DELIVERY_VARIANT = "public";
}

function clearCloudflareImagesEnvironment() {
  delete process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_IMAGES_API_TOKEN;
  delete process.env.CLOUDFLARE_IMAGES_DELIVERY_VARIANT;
}

function buildResponse(body: unknown, ok = true, status = 200): HttpResponse {
  return { json: async () => body, ok, status };
}

function buildStorageWithReservedId(fetcher: HttpFetcher) {
  return new CloudflareImagesSitepingScreenshotStorage(
    fetcher,
    () => RESERVED_IMAGE_ID
  );
}

describe("CloudflareImagesSitepingScreenshotStorage", () => {
  beforeEach(() => {
    configureCloudflareImagesEnvironment();
  });

  afterEach(() => {
    clearCloudflareImagesEnvironment();
    jest.restoreAllMocks();
  });

  it("uploads the screenshot pinning the reserved id and returns its delivery URL", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () =>
        buildResponse({ result: { id: RESERVED_IMAGE_ID }, success: true })
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBe(
      "https://imagedelivery.net/account-hash/reserved-image-1/public"
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetcher.mock.calls[0] ?? [];
    expect(requestUrl).toBe(UPLOAD_ENDPOINT);
    expect(init).toMatchObject({ method: HTTP_METHOD.post });
    expect((init?.body as FormData).get("id")).toBe(RESERVED_IMAGE_ID);
  });

  it("pins a Cloudflare-valid non-UUID custom id with the default generator", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ success: true })
    );
    // No injected id generator: exercise the production default so a regression
    // back to a raw UUID (which Cloudflare rejects, dropping every screenshot)
    // is caught here.
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).not.toBeNull();
    const [, init] = fetcher.mock.calls[0] ?? [];
    const pinnedId = (init?.body as FormData).get("id");
    expect(typeof pinnedId).toBe("string");
    expect((pinnedId as string).length).toBeLessThanOrEqual(
      CLOUDFLARE_MAX_CUSTOM_ID_LENGTH
    );
    expect(pinnedId).not.toMatch(UUID_PATTERN);
    // The reserved id drives the returned delivery URL, so the upload must be
    // addressed by exactly the id we pinned.
    expect(url).toBe(
      `https://imagedelivery.net/account-hash/${pinnedId as string}/public`
    );
  });

  it("returns null without calling Cloudflare when credentials are missing", async () => {
    delete process.env.CLOUDFLARE_IMAGES_API_TOKEN;
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns null without calling Cloudflare for a non-image data URL", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: "https://example.com/x.png" });

    expect(url).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reclaims the reserved id when the upload response is lost to a timeout", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          throw new Error("Request timed out");
        }

        return buildResponse({ success: true });
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBeNull();
    // The lost response is not treated as a safe no-op: the reserved id is
    // reclaimed so a server-side upload that completes after the abort cannot
    // orphan a public image with no feedback row to drive cleanup.
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [reclaimUrl, reclaimInit] = fetcher.mock.calls[1] ?? [];
    expect(reclaimUrl).toBe(RESERVED_IMAGE_RESOURCE_URL);
    expect(reclaimInit).toMatchObject({ method: HTTP_METHOD.delete });
  });

  it("drops the screenshot without reclaiming when Cloudflare rejects the upload with a client error", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          return buildResponse({ success: false }, false, 401);
        }

        return buildResponse({ success: true });
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    // A `4xx` upload rejection (bad credentials or a validation error) is a
    // confirmed outcome: Cloudflare refused the request and never created the
    // image, so there is nothing to reclaim. The screenshot is dropped and no
    // reclaim DELETE is issued.
    expect(url).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: HTTP_METHOD.post,
    });
  });

  it("reclaims the reserved id when Cloudflare returns a server error on upload because the image may still exist", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          return buildResponse({ success: false }, false, 500);
        }

        return buildResponse({ success: true });
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    // A `5xx` is not a confirmed rejection: the non-idempotent upload may have
    // completed on Cloudflare, so the reserved id is reclaimed. Here the reclaim
    // DELETE confirms the orphan is gone, so no screenshot is persisted.
    expect(url).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [reclaimUrl, reclaimInit] = fetcher.mock.calls[1] ?? [];
    expect(reclaimUrl).toBe(RESERVED_IMAGE_RESOURCE_URL);
    expect(reclaimInit).toMatchObject({ method: HTTP_METHOD.delete });
  });

  it("reclaims the reserved id when an OK upload response carries a malformed non-JSON body", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          return {
            json: async () => {
              throw new SyntaxError("Unexpected token < in JSON at position 0");
            },
            ok: true,
            status: 200,
          };
        }

        return buildResponse({ success: true });
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [reclaimUrl, reclaimInit] = fetcher.mock.calls[1] ?? [];
    expect(reclaimUrl).toBe(RESERVED_IMAGE_RESOURCE_URL);
    expect(reclaimInit).toMatchObject({ method: HTTP_METHOD.delete });
  });

  it("persists the reserved delivery URL when the upload times out and the reclaim delete returns a server error", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          throw new Error("Request timed out");
        }

        return buildResponse({ success: false }, false, 500);
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    // The upload may have completed on Cloudflare and the reclaim delete could
    // not confirm the orphan is gone, so the reserved delivery URL is persisted
    // as a retryable reference instead of dropped: the feedback row becomes the
    // only record of the possibly-live public image and a later deletion retry
    // can reclaim it.
    expect(url).toBe(RESERVED_DELIVERY_URL);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [reclaimUrl, reclaimInit] = fetcher.mock.calls[1] ?? [];
    expect(reclaimUrl).toBe(RESERVED_IMAGE_RESOURCE_URL);
    expect(reclaimInit).toMatchObject({ method: HTTP_METHOD.delete });
  });

  it("persists the reserved delivery URL when the upload times out and the reclaim delete returns 404 because the still-running create may complete after the abort", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          throw new Error("Request timed out");
        }

        // No upload response arrived, so Cloudflare's non-idempotent create may
        // still be running. A fast reclaim DELETE can race ahead of it and get a
        // 404 before the image appears, so this 404 is NOT confirmation the
        // orphan is gone.
        return buildResponse({ success: false }, false, 404);
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    // The aborted upload may still complete on Cloudflare, so a reclaim 404 is
    // not treated as a confirmed clear: the reserved delivery URL is persisted as
    // the only retryable handle to the possibly-live public image instead of
    // dropped, so a later deletion retry can reclaim it.
    expect(url).toBe(RESERVED_DELIVERY_URL);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [reclaimUrl, reclaimInit] = fetcher.mock.calls[1] ?? [];
    expect(reclaimUrl).toBe(RESERVED_IMAGE_RESOURCE_URL);
    expect(reclaimInit).toMatchObject({ method: HTTP_METHOD.delete });
  });

  it("drops the screenshot when a 5xx upload's reclaim delete returns 404 because the answered request is a confirmed absence", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          return buildResponse({ success: false }, false, 500);
        }

        return buildResponse({ success: false }, false, 404);
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    // Unlike an aborted upload, a `5xx` means Cloudflare answered the request, so
    // there is no create still racing the reclaim: a reclaim 404 is a confirmed
    // absence (the image was never created) and the screenshot is dropped rather
    // than persisting a delivery URL for an image that does not exist.
    expect(url).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [reclaimUrl, reclaimInit] = fetcher.mock.calls[1] ?? [];
    expect(reclaimUrl).toBe(RESERVED_IMAGE_RESOURCE_URL);
    expect(reclaimInit).toMatchObject({ method: HTTP_METHOD.delete });
  });

  it("persists the reserved delivery URL when the upload times out and the reclaim delete also times out", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => {
        throw new Error("Request timed out");
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBe(RESERVED_DELIVERY_URL);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("drops the screenshot on a client upload rejection instead of persisting a delivery URL for an image Cloudflare never accepted", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () =>
        // The upload is rejected for bad credentials and a reclaim DELETE would
        // fail auth with those same broken credentials. The reclaim must never
        // run: the upload was definitively rejected, so there is no image to
        // preserve. Persisting its reserved delivery URL would later block
        // deleting the feedback row for an image that does not exist.
        buildResponse({ success: false }, false, 403)
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: HTTP_METHOD.post,
    });
  });

  it("reclaims the reserved id when an OK upload response stalls the body stream", async () => {
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
        async (_input, init) => {
          if (init?.method === HTTP_METHOD.post) {
            // Headers arrive but the body never streams. The header-fetch
            // timeout is already cleared, so an unbounded read would hang
            // feedback creation; the bounded read must fall back instead.
            return {
              json: () => new Promise<unknown>(() => {}),
              ok: true,
              status: 200,
            };
          }

          return buildResponse({ success: true });
        }
      );
      const storage = buildStorageWithReservedId(fetcher);

      const storePromise = storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });
      await jest.advanceTimersByTimeAsync(SCREENSHOT_UPLOAD_TIMEOUT_MS);
      const url = await storePromise;

      expect(url).toBeNull();
      // The stalled read is treated as an unconfirmed upload, so the reserved id
      // is reclaimed exactly like a lost response or a malformed body.
      expect(fetcher).toHaveBeenCalledTimes(2);
      const [reclaimUrl, reclaimInit] = fetcher.mock.calls[1] ?? [];
      expect(reclaimUrl).toBe(RESERVED_IMAGE_RESOURCE_URL);
      expect(reclaimInit).toMatchObject({ method: HTTP_METHOD.delete });
    } finally {
      jest.useRealTimers();
    }
  });

  it("returns null when Cloudflare reports the upload unsuccessful", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          return buildResponse({ success: false });
        }

        return buildResponse({ success: true });
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBeNull();
  });

  it("deletes the Cloudflare image parsed from the stored delivery URL", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ success: true })
    );
    const storage = buildStorageWithReservedId(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toEqual({ screenshotCleared: true });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetcher.mock.calls[0] ?? [];
    expect(requestUrl).toBe(DELETE_ENDPOINT);
    expect(init).toMatchObject({ method: HTTP_METHOD.delete });
  });

  it("treats a 404 as already deleted and reports the screenshot cleared", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ success: false }, false, 404)
    );
    const storage = buildStorageWithReservedId(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toEqual({ screenshotCleared: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports the screenshot cleared without calling Cloudflare for an inline data URL", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = buildStorageWithReservedId(fetcher);

    await expect(
      storage.delete({ screenshotUrl: VALID_SCREENSHOT_DATA_URL })
    ).resolves.toEqual({ screenshotCleared: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports the screenshot cleared without calling Cloudflare for a URL on a host it never writes", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = buildStorageWithReservedId(fetcher);

    await expect(
      storage.delete({
        screenshotUrl: "https://example.com/some/other/image.png",
      })
    ).resolves.toEqual({ screenshotCleared: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports the screenshot uncleared without calling Cloudflare for a delivery URL under a mismatched account hash", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = buildStorageWithReservedId(fetcher);

    // A delivery URL on the Cloudflare Images host whose account hash does not
    // match the configured one (an account-hash rotation or env typo). The app
    // is the source of these URLs, so it is a real public orphan we cannot
    // confirm gone — the row must survive for a later retry, not be removed.
    await expect(
      storage.delete({
        screenshotUrl: "https://imagedelivery.net/other-hash/image-1/public",
      })
    ).resolves.toEqual({ screenshotCleared: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports the screenshot uncleared without calling Cloudflare when credentials are missing", async () => {
    delete process.env.CLOUDFLARE_IMAGES_API_TOKEN;
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = buildStorageWithReservedId(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toEqual({ screenshotCleared: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports the screenshot cleared for an inline data URL even when credentials are missing", async () => {
    delete process.env.CLOUDFLARE_IMAGES_API_TOKEN;
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = buildStorageWithReservedId(fetcher);

    // A legacy row with an inline `data:` screenshot has no remote image we own,
    // so it is already effectively cleared. Requiring credentials first would
    // throw on delete and strand the feedback row forever even though there is
    // nothing remote to preserve.
    await expect(
      storage.delete({ screenshotUrl: VALID_SCREENSHOT_DATA_URL })
    ).resolves.toEqual({ screenshotCleared: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports the screenshot cleared for a URL on a host it never writes even when credentials are missing", async () => {
    delete process.env.CLOUDFLARE_IMAGES_API_TOKEN;
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = buildStorageWithReservedId(fetcher);

    // A non-delivery URL the adapter already treats as nothing remote to delete
    // must be classified before requiring the Cloudflare environment, so the row
    // is removable instead of being kept forever.
    await expect(
      storage.delete({ screenshotUrl: "https://example.com/some/other/image.png" })
    ).resolves.toEqual({ screenshotCleared: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports the screenshot uncleared when Cloudflare rejects the delete with an auth error", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ success: false }, false, 403)
    );
    const storage = buildStorageWithReservedId(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toEqual({ screenshotCleared: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports the screenshot uncleared when Cloudflare returns a server error", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ success: false }, false, 500)
    );
    const storage = buildStorageWithReservedId(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toEqual({ screenshotCleared: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports the screenshot uncleared on a network error so the feedback is kept for retry", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => {
        throw new Error("network down");
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toEqual({ screenshotCleared: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
