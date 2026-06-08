import "server-only";

import {
  buildCloudflareImagesDeliveryUrl,
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
  SitepingScreenshotStorage,
  StoreSitepingScreenshotCommand,
} from "@/src/modules/siteping/domain/repositories/siteping-screenshot-storage";

const CLOUDFLARE_IMAGES_UPLOAD = {
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
  return `${CLOUDFLARE_IMAGES_UPLOAD.baseUrl}/${environment.accountId}/${CLOUDFLARE_IMAGES_UPLOAD.imagePath}`;
}

/**
 * Uploads a SitePing screenshot to Cloudflare Images server-side and returns its
 * public delivery URL. Reuses the shared Cloudflare configuration already used
 * for message attachments; returns `null` when unconfigured or on any failure so
 * the use case can fall back to inline persistence.
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
      CLOUDFLARE_IMAGES_UPLOAD.fileField,
      decoded.blob,
      CLOUDFLARE_IMAGES_UPLOAD.fileName
    );

    let response: HttpResponse;
    try {
      response = await fetchWithResilience(
        this.fetcher,
        buildUploadUrl(environment),
        {
          body,
          headers: {
            Authorization: `${CLOUDFLARE_IMAGES_UPLOAD.tokenPrefix} ${environment.apiToken}`,
          },
          method: "POST",
        },
        SCREENSHOT_UPLOAD_RESILIENCE
      );
    } catch {
      // Timeout or network error — map to a stable null so the caller falls back.
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
}
