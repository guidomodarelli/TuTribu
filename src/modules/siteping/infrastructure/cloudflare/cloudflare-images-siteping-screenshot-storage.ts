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
  readJsonWithTimeout,
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

/**
 * Cloudflare answers an upload it refuses outright — bad credentials (`401`/
 * `403`) or a validation error — with a `4xx` status. A client error is a
 * confirmed outcome: the request was rejected and no image was created. A `5xx`
 * (or a lost/stalled response) is instead genuinely unconfirmed because the
 * non-idempotent upload may still have completed, so only the `4xx` range is
 * treated as a definitive rejection.
 */
const HTTP_STATUS_CLIENT_ERROR_RANGE = { maxExclusive: 500, min: 400 } as const;

/**
 * Reports whether an upload response status is a definitive client/auth
 * rejection (`4xx`). A definitive rejection means Cloudflare never created the
 * image, so the caller drops the screenshot instead of reclaiming the reserved
 * id or persisting a delivery URL for an image that does not exist. An absent
 * status is treated as not definitive so an unknown outcome stays reclaimable.
 */
function isDefinitiveUploadRejection(status: number | undefined): boolean {
  return (
    status !== undefined &&
    status >= HTTP_STATUS_CLIENT_ERROR_RANGE.min &&
    status < HTTP_STATUS_CLIENT_ERROR_RANGE.maxExclusive
  );
}

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

/**
 * Controls how a `404` from the orphan-reclaim `DELETE` is interpreted.
 */
type DeleteImageOptions = {
  /**
   * Whether a `DELETE` `404` confirms the orphan is cleared. `true` (the
   * default) whenever the image was already created before this delete — a
   * reclaim after a response-bearing upload, and the
   * {@link CloudflareImagesSitepingScreenshotStorage.delete} orphan-cleanup flow
   * for a feedback created long enough ago that its upload cannot still be in
   * flight. `false` whenever the non-idempotent create may still be running on
   * Cloudflare: a reclaim after an aborted upload (no response arrived), or a
   * `delete` of a reserved delivery URL whose unconfirmed upload could still be
   * racing because the feedback is being deleted within the upload race window. A
   * fast `DELETE` can race ahead of that create and `404` before the image
   * appears, so a `404` is not confirmation the orphan is gone and the reserved
   * delivery URL must be kept for a later retry.
   */
  treatNotFoundAsCleared?: boolean;
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
 * for message attachments; returns `null` when unconfigured, when Cloudflare
 * confirms the upload was rejected (a `4xx` client/auth error, where no image
 * was ever created), or when an unconfirmed upload is confirmed reclaimed, so
 * the use case persists no screenshot instead of inlining the data URL. Only
 * when an unconfirmed upload's reclaim delete also cannot be confirmed does it
 * return the reserved delivery URL, so the feedback row keeps a retryable
 * reference to a possibly-live public image.
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
      // Timeout, abort, or network error — no response arrived, so the
      // non-idempotent upload may still be completing on Cloudflare after we
      // abandon the read. Reclaim the reserved id, but a reclaim `404` is not a
      // confirmed clear here: a fast DELETE can race ahead of the still-running
      // create and `404` before the image appears, after which dropping the
      // reserved delivery URL would strand an unaddressable public orphan with no
      // row to drive cleanup. Keep the URL unless a real deletion confirms the
      // orphan is gone, instead of treating the lost response as a safe no-op.
      return this.reclaimReservedImageId(environment, reservedImageId, {
        treatNotFoundAsCleared: false,
      });
    }

    const deliveryUrl = await this.resolveUploadedDeliveryUrl(
      environment,
      response,
      reservedImageId
    );
    if (deliveryUrl) {
      return deliveryUrl;
    }

    if (isDefinitiveUploadRejection(response.status)) {
      // A `4xx` client/auth rejection is a confirmed outcome: Cloudflare refused
      // the request and never created the image, so there is nothing to reclaim
      // and no screenshot to preserve. Reclaiming here would reuse the same
      // failing credentials and could persist a reserved delivery URL for an
      // image that does not exist, which would then block deleting the feedback
      // row until the credentials are fixed. Drop the screenshot instead.
      return null;
    }

    // The outcome is genuinely unconfirmed (a `5xx`, or an OK response with a
    // malformed or stalled body): the non-idempotent upload may still have
    // completed on Cloudflare, so reclaim the reserved id before dropping the
    // screenshot rather than letting a partially created image orphan.
    return this.reclaimReservedImageId(environment, reservedImageId);
  }

  /**
   * Reclaims the reserved id after an unconfirmed upload and resolves to the
   * value to persist in `screenshot_url`. Returns `null` when the best-effort
   * delete confirms the orphan is gone, so no screenshot is persisted. When the
   * delete cannot confirm the orphan is cleared (an auth/`4xx`/`5xx` response, a
   * timeout, or a network error) the upload may have completed on Cloudflare and
   * left a live public image, so it returns the reserved delivery URL: persisting
   * it makes the feedback row the only record of that URL and lets a later
   * deletion retry reclaim the orphan, instead of dropping the reference and
   * stranding an unaddressable public image with no row to ever drive its
   * cleanup.
   *
   * What counts as confirmed depends on
   * {@link DeleteImageOptions.treatNotFoundAsCleared}: a real deletion (`ok`)
   * always confirms, while a `404` confirms only for a reclaim after a
   * response-bearing upload. For a reclaim after an aborted upload the create may
   * still be running, so a `404` can be the delete racing ahead of it and is then
   * not treated as confirmation, keeping the reserved delivery URL.
   */
  private async reclaimReservedImageId(
    environment: CloudflareImagesEnvironment,
    reservedImageId: string,
    options: DeleteImageOptions = {}
  ): Promise<string | null> {
    const { screenshotCleared } = await this.deleteImageById(
      environment,
      reservedImageId,
      options
    );

    if (screenshotCleared) {
      return null;
    }

    return buildCloudflareImagesDeliveryUrl({
      accountHash: environment.accountHash,
      deliveryVariant: environment.deliveryVariant,
      imageId: reservedImageId,
    });
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
      // The upload timeout in `fetchWithResilience` only covers the header
      // fetch and is already cleared once this response arrives, so an
      // intermediary (e.g. Cloudflare) that sends headers and then stalls the
      // body stream would hang a bare `response.json()` forever and block
      // feedback creation. Bound the body read on the same upload budget so a
      // stalled — or malformed, non-JSON — body both surface as an unconfirmed
      // upload that lets the caller reclaim the reserved id instead.
      payload = (await readJsonWithTimeout(
        response,
        SCREENSHOT_UPLOAD_RESILIENCE.timeoutMs
      )) as CloudflareImageUploadResponse;
    } catch {
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

    // Honor the caller's race-window decision: when the stored value is a
    // reserved delivery URL whose upload was never confirmed and the feedback is
    // deleted before the create could have landed, the caller passes
    // `treatNotFoundAsCleared: false` so a `404` here is not trusted as a
    // confirmed clear. Omitted (the common case) it defaults to `true`.
    return this.deleteImageById(environment, classification.imageId, {
      treatNotFoundAsCleared: command.treatNotFoundAsCleared,
    });
  }

  /**
   * Issues the idempotent `DELETE` for a Cloudflare image id and reports whether
   * the orphan is confirmed cleared. Shared by {@link delete} and by the
   * store-time reclaim of a reserved id on an unconfirmed upload; it never
   * throws, so a reclaim cannot mask the upload failure that triggered it.
   */
  private async deleteImageById(
    environment: CloudflareImagesEnvironment,
    imageId: string,
    { treatNotFoundAsCleared = true }: DeleteImageOptions = {}
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

    // `ok` always confirms the orphan is gone (deleted now). A `404` confirms it
    // only when the image was already created before this delete — true for a
    // reclaim after a response-bearing upload and for a delete() of a feedback
    // whose upload can no longer be in flight. It is NOT confirmation while the
    // non-idempotent create may still be running (a reclaim after an aborted
    // upload, or a delete() within the upload race window): a fast DELETE can
    // `404` before the image appears, so the caller passes
    // `treatNotFoundAsCleared: false` to keep the reserved URL for a later retry.
    // Any other status (auth/`4xx`/`5xx`) may have left the image, so report it
    // uncleared so the feedback row survives for a later retry.
    const screenshotCleared =
      response.ok ||
      (treatNotFoundAsCleared && response.status === HTTP_STATUS_NOT_FOUND);

    return { screenshotCleared };
  }
}
