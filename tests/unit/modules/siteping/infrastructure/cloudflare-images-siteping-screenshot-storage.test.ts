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

describe("CloudflareImagesSitepingScreenshotStorage", () => {
  beforeEach(() => {
    configureCloudflareImagesEnvironment();
  });

  afterEach(() => {
    clearCloudflareImagesEnvironment();
    jest.restoreAllMocks();
  });

  it("uploads the screenshot and returns the Cloudflare delivery URL", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ result: { id: "image-1" }, success: true })
    );
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBe("https://imagedelivery.net/account-hash/image-1/public");
    const [requestUrl, init] = fetcher.mock.calls[0] ?? [];
    expect(requestUrl).toBe(UPLOAD_ENDPOINT);
    expect(init).toMatchObject({ method: "POST" });
  });

  it("returns null without calling Cloudflare when credentials are missing", async () => {
    delete process.env.CLOUDFLARE_IMAGES_API_TOKEN;
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns null without calling Cloudflare for a non-image data URL", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    const url = await storage.store({ dataUrl: "https://example.com/x.png" });

    expect(url).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns null when Cloudflare rejects the upload", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ success: false }, false, 401)
    );
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBeNull();
  });

  it("returns null when an OK response carries a malformed non-JSON body", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => ({
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON at position 0");
        },
        ok: true,
        status: 200,
      })
    );
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    const url = await storage.store({ dataUrl: VALID_SCREENSHOT_DATA_URL });

    expect(url).toBeNull();
  });

  it("deletes the Cloudflare image parsed from the stored delivery URL", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ success: true })
    );
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetcher.mock.calls[0] ?? [];
    expect(requestUrl).toBe(DELETE_ENDPOINT);
    expect(init).toMatchObject({ method: "DELETE" });
  });

  it("treats a 404 as already deleted without throwing", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => buildResponse({ success: false }, false, 404)
    );
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not call Cloudflare when the stored value is an inline data URL", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    await expect(
      storage.delete({ screenshotUrl: VALID_SCREENSHOT_DATA_URL })
    ).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not call Cloudflare for a delivery URL from another account", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    await expect(
      storage.delete({
        screenshotUrl: "https://imagedelivery.net/other-hash/image-1/public",
      })
    ).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not call Cloudflare to delete when credentials are missing", async () => {
    delete process.env.CLOUDFLARE_IMAGES_API_TOKEN;
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>();
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("swallows a network error so feedback deletion is never blocked", async () => {
    const fetcher = jest.fn<ReturnType<HttpFetcher>, Parameters<HttpFetcher>>(
      async () => {
        throw new Error("network down");
      }
    );
    const storage = new CloudflareImagesSitepingScreenshotStorage(fetcher);

    await expect(
      storage.delete({ screenshotUrl: STORED_DELIVERY_URL })
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
