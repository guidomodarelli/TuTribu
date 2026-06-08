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

  it("reclaims the reserved id when Cloudflare rejects the upload", async () => {
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

  it("persists the reserved delivery URL when Cloudflare rejects the upload and the reclaim delete fails auth", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async (_input, init) => {
        if (init?.method === HTTP_METHOD.post) {
          return buildResponse({ success: false }, false, 401);
        }

        return buildResponse({ success: false }, false, 403);
      }
    );
    const storage = buildStorageWithReservedId(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBe(RESERVED_DELIVERY_URL);
    expect(fetcher).toHaveBeenCalledTimes(2);
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
