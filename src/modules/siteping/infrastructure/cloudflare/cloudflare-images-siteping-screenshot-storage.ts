import "server-only";

import {
  buildCloudflareImagesDeliveryUrl,
  classifyCloudflareImagesDeliveryUrl,
  CLOUDFLARE_IMAGES_DELIVERY_URL_KIND,
  isCloudflareImagesDeliveryUrl,
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
  DeleteSitepingScreenshotResult,
  SitepingScreenshotStorage,
  StoreSitepingScreenshotCommand,
} from "@/src/modules/siteping/domain/repositories/siteping-screenshot-storage";

/**
 * A `DELETE` on a missing image returns `404`, which Cloudflare uses to signal
 * the image is already gone — equivalent to a successful deletion for our
 * orphan-cleanup purpose.
 */
const HTTP_STATUS_NOT_FOUND = 404;

const CLOUDFLARE_IMAGES_API = {
  baseUrl: "https://api.cloudflare.com/client/v4/accounts",
  fileField: "file",
  fileName: "siteping-screenshot",
  /**
   * Optional multipart field that pins a custom image identifier on `POST`. We
   * reserve the id before uploading so the delivery URL is known up front and a
   * lost response can never leave an unaddressable orphan.
   */
  idField: "id",
  imagePath: "images/v1",
  tokenPrefix: "Bearer",
} as const;

/**
 * A `POST` to `images/v1` is not idempotent, so we keep a bounded timeout with
 * no retries and let the caller fall back rather than ever blocking feedback
 * creation on a slow upload. Because we pin a reserved id on the request, a lost
 * response is no longer a safe no-op: the upload may still complete on
 * Cloudflare after we abort the read, so the caller reclaims the reserved id
 * instead of stranding a public orphan with no row to drive cleanup.
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

/**
 * Cloudflare rejects a custom image id that is in UUID format with "Custom ID is
 * not valid: Must not be UUID", because that shape is reserved for the ids it
 * auto-generates. Stripping the hyphens from a random UUID yields a 32-character
 * hex id that is collision-free yet not in UUID format, so Cloudflare accepts it
 * as a pinned custom id.
 */
const UUID_HYPHEN_PATTERN = /-/g;

/**
 * Builds the default reserved Cloudflare image id: a random UUID with its
 * hyphens removed. A raw `crypto.randomUUID()` is in UUID format and Cloudflare
 * would reject it on upload, silently dropping every screenshot, so the hyphens
 * must be stripped to keep the id collision-free while staying a valid custom id.
 */
function generateCloudflareCustomImageId(): string {
  return crypto.randomUUID().replace(UUID_HYPHEN_PATTERN, "");
}

/**
 * Generates a reserved Cloudflare image id. Injectable so tests can pin a
 * deterministic id; defaults to a hyphen-stripped random UUID, which never
 * collides with an existing image and is not in UUID format (which Cloudflare
 * rejects as a custom id), so reclaiming the reserved id on an unconfirmed
 * upload stays safe — it can only ever delete the image this request created.
 */
export type SitepingScreenshotImageIdGenerator = () => string;

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

  private readonly generateImageId: SitepingScreenshotImageIdGenerator;

  constructor(
    fetcher: HttpFetcher = (input, init) => fetch(input, init),
    generateImageId: SitepingScreenshotImageIdGenerator = generateCloudflareCustomImageId
  ) {
    this.fetcher = fetcher;
    this.generateImageId = generateImageId;
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

    // Reserve the image id before uploading so the upload identity is known even
    // when the response is lost. A `POST` to `images/v1` is not idempotent and
    // Cloudflare can still finish creating the image after we abort a slow
    // response, so without a known id that image would orphan publicly with no
    // feedback row to ever drive its cleanup.
    const reservedImageId = this.generateImageId();

    const body = new FormData();
    body.set(
      CLOUDFLARE_IMAGES_API.fileField,
      decoded.blob,
      CLOUDFLARE_IMAGES_API.fileName
    );
    body.set(CLOUDFLARE_IMAGES_API.idField, reservedImageId);

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
      // Timeout, abort, or network error — the upload may still complete on
      // Cloudflare after we abandon the read, so reclaim the reserved id with a
      // best-effort delete instead of treating the lost response as a safe no-op
      // that would strand a public orphan. Then map to a stable null so the
      // caller drops the screenshot instead of inlining the data URL.
      await this.deleteImageById(environment, reservedImageId);
      return null;
    }

    const deliveryUrl = await this.resolveUploadedDeliveryUrl(
      environment,
      response,
      reservedImageId
    );
    if (!deliveryUrl) {
      // The upload was rejected or its outcome is unconfirmed (a non-OK status
      // or an OK response with a malformed body), and either case may still have
      // created the image. Reclaim the reserved id before dropping the screenshot
      // so a partially created image cannot orphan.
      await this.deleteImageById(environment, reservedImageId);
      return null;
    }

    return deliveryUrl;
  }

  /**
   * Maps a completed upload response to the reserved delivery URL, or `null`
   * when the upload was not confirmed. The id is the one we pinned on the
   * request, not the one echoed in the body, so even a malformed-but-OK response
   * (which may still have created the image) is treated as unconfirmed and lets
   * the caller reclaim the orphan.
   */
  private async resolveUploadedDeliveryUrl(
    environment: CloudflareImagesEnvironment,
    response: HttpResponse,
    reservedImageId: string
  ): Promise<string | null> {
    if (!response.ok) {
      return null;
    }

    let payload: CloudflareImageUploadResponse;
    try {
      payload = (await response.json()) as CloudflareImageUploadResponse;
    } catch {
      // An intermediary (e.g. Cloudflare) can return an OK response with a
      // malformed, non-JSON body. Treat the upload as unconfirmed so the caller
      // reclaims the reserved id rather than letting the parse error block
      // feedback creation or strand a possibly-created orphan.
      return null;
    }

    if (!payload.success) {
      return null;
    }

    // Build the URL from the reserved id we pinned on the request, not the one
    // echoed in the body, so the delivery URL is the one we already control.
    return buildCloudflareImagesDeliveryUrl({
      accountHash: environment.accountHash,
      deliveryVariant: environment.deliveryVariant,
      imageId: reservedImageId,
    });
  }

  async delete(
    command: DeleteSitepingScreenshotCommand
  ): Promise<DeleteSitepingScreenshotResult> {
    if (!isCloudflareImagesDeliveryUrl(command.screenshotUrl)) {
      // Inline `data:` fallback or a value on a host we never write — there is no
      // remote image we own, so the screenshot is already effectively cleared and
      // the feedback row can be removed. Classify this before requiring the
      // Cloudflare environment so a legacy non-delivery URL does not strand the
      // feedback row forever just because storage is unconfigured.
      return { screenshotCleared: true };
    }

    const environment = readCloudflareImagesEnvironment();
    if (!environment) {
      // A delivery-host URL we cannot reach without credentials; report it
      // uncleared so the caller keeps the feedback row for a later retry once
      // storage is configured.
      return { screenshotCleared: false };
    }

    const classification = classifyCloudflareImagesDeliveryUrl({
      accountHash: environment.accountHash,
      deliveryUrl: command.screenshotUrl,
    });

    if (classification.kind === CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.notDelivery) {
      // A delivery-host URL with no usable image segment (a bare host or missing
      // path) — nothing remote we own, so the feedback row can be removed.
      return { screenshotCleared: true };
    }

    if (
      classification.kind === CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.foreignAccount
    ) {
      // A Cloudflare delivery URL under a different account hash (a rotation or
      // an env typo). Since this app is the source of persisted screenshot URLs,
      // the public image is likely a real orphan we cannot confirm gone with the
      // current credentials. Report it uncleared so the caller keeps the row —
      // the only record of the delivery URL — for a later retry once the account
      // hash is realigned, instead of silently orphaning the screenshot.
      return { screenshotCleared: false };
    }

    return this.deleteImageById(environment, classification.imageId);
  }

  /**
   * Issues the idempotent `DELETE` for a Cloudflare image id and reports whether
   * the orphan is confirmed cleared. Shared by {@link delete} and by the
   * store-time reclaim of a reserved id on an unconfirmed upload; it never
   * throws, so a reclaim cannot mask the upload failure that triggered it.
   */
  private async deleteImageById(
    environment: CloudflareImagesEnvironment,
    imageId: string
  ): Promise<DeleteSitepingScreenshotResult> {
    let response: HttpResponse;
    try {
      response = await fetchWithResilience(
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
      // Timeout or network error — the image may still exist, so report it
      // uncleared to keep the feedback row retryable rather than stranding an
      // orphan with no trigger to reclaim it.
      return { screenshotCleared: false };
    }

    // `ok` (deleted now) and `404` (already gone) both confirm the orphan is
    // cleared. Any other status (auth/`4xx`/`5xx`) may have left the image, so
    // report it uncleared so the feedback row survives for a later retry.
    const screenshotCleared =
      response.ok || response.status === HTTP_STATUS_NOT_FOUND;

    return { screenshotCleared };
  }
}
