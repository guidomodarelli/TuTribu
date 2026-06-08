const CLOUDFLARE_IMAGES_ENV = {
  accountHash: "CLOUDFLARE_IMAGES_ACCOUNT_HASH",
  accountId: "CLOUDFLARE_ACCOUNT_ID",
  apiToken: "CLOUDFLARE_IMAGES_API_TOKEN",
  deliveryVariant: "CLOUDFLARE_IMAGES_DELIVERY_VARIANT",
} as const;

const CLOUDFLARE_IMAGES_DEFAULTS = {
  deliveryVariant: "public",
} as const;

const CLOUDFLARE_IMAGES_DELIVERY = {
  host: "imagedelivery.net",
} as const;

export type CloudflareImagesEnvironment = {
  accountHash: string;
  accountId: string;
  apiToken: string;
  deliveryVariant: string;
};

function readRequiredEnvironmentValue(name: string): string | null {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

export function readCloudflareImagesEnvironment(): CloudflareImagesEnvironment | null {
  const accountHash = readRequiredEnvironmentValue(
    CLOUDFLARE_IMAGES_ENV.accountHash
  );
  const accountId = readRequiredEnvironmentValue(
    CLOUDFLARE_IMAGES_ENV.accountId
  );
  const apiToken = readRequiredEnvironmentValue(
    CLOUDFLARE_IMAGES_ENV.apiToken
  );

  if (!accountHash || !accountId || !apiToken) {
    return null;
  }

  return {
    accountHash,
    accountId,
    apiToken,
    deliveryVariant:
      readRequiredEnvironmentValue(CLOUDFLARE_IMAGES_ENV.deliveryVariant) ??
      CLOUDFLARE_IMAGES_DEFAULTS.deliveryVariant,
  };
}

export function buildCloudflareImagesDeliveryUrl({
  accountHash,
  deliveryVariant,
  imageId,
}: {
  accountHash: string;
  deliveryVariant: string;
  imageId: string;
}): string {
  return `https://${CLOUDFLARE_IMAGES_DELIVERY.host}/${accountHash}/${imageId}/${deliveryVariant}`;
}

/**
 * Recovers the Cloudflare image identifier from a delivery URL produced by
 * {@link buildCloudflareImagesDeliveryUrl}. Returns `null` when the value is not
 * a delivery URL for the given account (for example an inline `data:` URL kept
 * as a fallback), so callers can skip the remote delete without throwing.
 *
 * @param accountHash - Cloudflare Images account hash the URL must belong to.
 * @param deliveryUrl - Stored public URL to parse the image identifier from.
 * @returns The image identifier, or `null` when the URL is not a matching delivery URL.
 */
export function extractCloudflareImagesIdFromDeliveryUrl({
  accountHash,
  deliveryUrl,
}: {
  accountHash: string;
  deliveryUrl: string;
}): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(deliveryUrl);
  } catch {
    // Not an absolute URL (e.g. an inline data URL fallback) — nothing to delete.
    return null;
  }

  if (parsedUrl.host !== CLOUDFLARE_IMAGES_DELIVERY.host) {
    return null;
  }

  const [urlAccountHash, imageId] = parsedUrl.pathname
    .split("/")
    .filter(Boolean);

  if (urlAccountHash !== accountHash || !imageId) {
    return null;
  }

  return imageId;
}
