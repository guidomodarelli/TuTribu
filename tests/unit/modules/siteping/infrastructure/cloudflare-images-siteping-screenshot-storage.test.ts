jest.mock("server-only", () => ({}));

import { CloudflareImagesSitepingScreenshotStorage } from "@/src/modules/siteping/infrastructure/cloudflare/cloudflare-images-siteping-screenshot-storage";
import type { HttpFetcher, HttpResponse } from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

const VALID_SCREENSHOT_DATA_URL = "data:image/jpeg;base64,SGVsbG8=";
const UPLOAD_ENDPOINT =
  "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1";

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
});
