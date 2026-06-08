import "server-only";

import {
  buildCloudflareImagesDeliveryUrl,
  extractCloudflareImagesIdFromDeliveryUrl,
  readCloudflareImagesEnvironment,
  type CloudflareImagesEnvironment,
} from "@/src/modules/shared/infrastructure/cloudflare/cloudflare-images-config";
import {
  fetchWithResilience,
  type FetchResilienceOptions,
  type HttpFetcher,
  type HttpResponse,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";
import type {
  DeleteSitepingScreenshotCommand,
  SitepingScreenshotStorage,
  StoreSitepingScreenshotCommand,
} from "@/src/modules/siteping/domain/repositories/siteping-screenshot-storage";

const CLOUDFLARE_IMAGES_API = {
  baseUrl: "https://api.cloudflare.com/client/v4/accounts",
  fileField: "file",
  fileName: "siteping-screenshot",
  imagePath: "images/v1",
  tokenPrefix: "Bearer",
} as const;

/**
 * A `POST` to `images/v1` creates a new image, so a retry could upload a
 * duplicate. We keep a bounded timeout with no retries and let the caller fall
 * back rather than ever blocking feedback creation on a slow upload.
 */
const SCREENSHOT_UPLOAD_RESILIENCE: FetchResilienceOptions = {
  maxRetries: 0,
  retryDelayMs: 0,
  timeoutMs: 5000,
};

/**
 * A `DELETE` on `images/v1/{id}` is idempotent (a missing image returns 404,
 * which we treat as already deleted), but we keep a bounded timeout with no
 * retries so a slow Cloudflare never blocks the feedback deletion flow. A
 * remaining orphan is reclaimable on a later deletion retry.
 */
const SCREENSHOT_DELETE_RESILIENCE: FetchResilienceOptions = {
  maxRetries: 0,
  retryDelayMs: 0,
  timeoutMs: 5000,
};

const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

type CloudflareImageUploadResponse = {
  result?: { id?: string };
  success?: boolean;
};

function decodeImageDataUrl(
  dataUrl: string
): { blob: Blob; contentType: string } | null {
  const match = IMAGE_DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    return null;
  }

  const [, contentType, base64] = match;
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    // Malformed base64 — drop the screenshot rather than fail the feedback.
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { blob: new Blob([bytes], { type: contentType }), contentType };
}

function buildUploadUrl(environment: CloudflareImagesEnvironment): string {
  return `${CLOUDFLARE_IMAGES_API.baseUrl}/${environment.accountId}/${CLOUDFLARE_IMAGES_API.imagePath}`;
}

function buildImageResourceUrl(
  environment: CloudflareImagesEnvironment,
  imageId: string
): string {
  return `${CLOUDFLARE_IMAGES_API.baseUrl}/${environment.accountId}/${CLOUDFLARE_IMAGES_API.imagePath}/${imageId}`;
}

/**
 * Uploads a SitePing screenshot to Cloudflare Images server-side and returns its
 * public delivery URL. Reuses the shared Cloudflare configuration already used
 * for message attachments; returns `null` when unconfigured or on any failure so
 * the use case persists no screenshot instead of inlining the data URL.
 */
export class CloudflareImagesSitepingScreenshotStorage
  implements SitepingScreenshotStorage
{
  private readonly fetcher: HttpFetcher;

  constructor(fetcher: HttpFetcher = (input, init) => fetch(input, init)) {
    this.fetcher = fetcher;
  }

  async store(command: StoreSitepingScreenshotCommand): Promise<string | null> {
    const environment = readCloudflareImagesEnvironment();
    if (!environment) {
      return null;
    }

    const decoded = decodeImageDataUrl(command.dataUrl);
    if (!decoded) {
      return null;
    }

    const body = new FormData();
    body.set(
      CLOUDFLARE_IMAGES_API.fileField,
      decoded.blob,
      CLOUDFLARE_IMAGES_API.fileName
    );

    let response: HttpResponse;
    try {
      response = await fetchWithResilience(
        this.fetcher,
        buildUploadUrl(environment),
        {
          body,
          headers: {
            Authorization: `${CLOUDFLARE_IMAGES_API.tokenPrefix} ${environment.apiToken}`,
          },
          method: "POST",
        },
        SCREENSHOT_UPLOAD_RESILIENCE
      );
    } catch {
      // Timeout or network error — map to a stable null so the caller drops the
      // screenshot instead of inlining the data URL.
      return null;
    }

    if (!response.ok) {
      return null;
    }

    let payload: CloudflareImageUploadResponse;
    try {
      payload = (await response.json()) as CloudflareImageUploadResponse;
    } catch {
      // An intermediary (e.g. Cloudflare) can return an OK response with a
      // malformed, non-JSON body. Map it to a stable null so the caller falls
      // back rather than letting the parse error block feedback creation.
      return null;
    }

    const imageId = payload.result?.id;
    if (!payload.success || !imageId) {
      return null;
    }

    return buildCloudflareImagesDeliveryUrl({
      accountHash: environment.accountHash,
      deliveryVariant: environment.deliveryVariant,
      imageId,
    });
  }

  async delete(command: DeleteSitepingScreenshotCommand): Promise<void> {
    const environment = readCloudflareImagesEnvironment();
    if (!environment) {
      return;
    }

    const imageId = extractCloudflareImagesIdFromDeliveryUrl({
      accountHash: environment.accountHash,
      deliveryUrl: command.screenshotUrl,
    });
    if (!imageId) {
      // Inline `data:` fallback or a URL we did not produce — no remote image
      // to delete, so deleting feedback is a clean no-op here.
      return;
    }

    try {
      // Any resolved response is accepted: `ok` and `404` (already gone) both
      // mean the orphan is cleared, and any other status leaves it for a later
      // deletion retry. Only a timeout/network error rejects, which we swallow
      // so the feedback record can still be removed.
      await fetchWithResilience(
        this.fetcher,
        buildImageResourceUrl(environment, imageId),
        {
          headers: {
            Authorization: `${CLOUDFLARE_IMAGES_API.tokenPrefix} ${environment.apiToken}`,
          },
          method: "DELETE",
        },
        SCREENSHOT_DELETE_RESILIENCE
      );
    } catch {
      // Timeout or network error — leave the orphan rather than block feedback
      // deletion; a later deletion retry can reclaim it.
      return;
    }
  }
}
