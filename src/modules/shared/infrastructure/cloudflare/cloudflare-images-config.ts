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
 * Outcome of inspecting a stored screenshot URL against the configured account,
 * so the caller can decide whether the remote image is owned and deletable, an
 * unconfirmed orphan, or nothing it owns at all.
 *
 * - `owned`: a delivery URL on the Cloudflare Images host whose account hash
 *   matches the configured one. `imageId` is safe to `DELETE` through the API.
 * - `foreign-account`: a delivery URL on the Cloudflare Images host whose
 *   account hash does NOT match the configured one. This app only ever persists
 *   Cloudflare delivery URLs (or inline `data:` fallbacks) as screenshot URLs,
 *   so a host match with a mismatched hash means an account-hash rotation or an
 *   env typo, not a third-party URL. The public image is likely a real orphan
 *   the current credentials cannot confirm gone, so the caller must treat it as
 *   unconfirmed instead of already cleared.
 * - `not-delivery`: not an absolute URL, or not on the Cloudflare Images host
 *   (for example an inline `data:` fallback kept on legacy rows). There is no
 *   remote image we own, so the caller can skip the remote delete.
 */
export const CLOUDFLARE_IMAGES_DELIVERY_URL_KIND = {
  foreignAccount: "foreign-account",
  notDelivery: "not-delivery",
  owned: "owned",
} as const;

export type CloudflareImagesDeliveryUrlClassification =
  | { kind: typeof CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.owned; imageId: string }
  | { kind: typeof CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.foreignAccount }
  | { kind: typeof CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.notDelivery };

/**
 * Classifies a stored screenshot URL against the configured account hash so the
 * caller can tell an owned delivery URL (deletable) from one produced under a
 * different or misconfigured account hash (an unconfirmed orphan) and from a
 * value that is not a Cloudflare delivery URL at all (nothing remote to delete).
 *
 * It is the inverse of {@link buildCloudflareImagesDeliveryUrl} and never throws.
 *
 * @param accountHash - Cloudflare Images account hash the URL must belong to.
 * @param deliveryUrl - Stored screenshot URL to classify.
 * @returns The classification of the URL relative to the configured account.
 */
export function classifyCloudflareImagesDeliveryUrl({
  accountHash,
  deliveryUrl,
}: {
  accountHash: string;
  deliveryUrl: string;
}): CloudflareImagesDeliveryUrlClassification {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(deliveryUrl);
  } catch {
    // Not an absolute URL (e.g. an inline data URL fallback) — nothing to delete.
    return { kind: CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.notDelivery };
  }

  if (parsedUrl.host !== CLOUDFLARE_IMAGES_DELIVERY.host) {
    // A host we never write a screenshot URL to — nothing remote we own.
    return { kind: CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.notDelivery };
  }

  const [urlAccountHash, imageId] = parsedUrl.pathname
    .split("/")
    .filter(Boolean);

  if (!urlAccountHash) {
    // Bare delivery host with no path — not a screenshot URL we produced.
    return { kind: CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.notDelivery };
  }

  if (urlAccountHash !== accountHash) {
    // Same Cloudflare Images host but a different account hash: an account-hash
    // rotation or env typo, not a foreign URL. The orphan cannot be confirmed
    // gone with the current credentials, so the caller keeps the row for retry.
    return { kind: CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.foreignAccount };
  }

  if (!imageId) {
    // Matching host and hash but no image segment — nothing to delete.
    return { kind: CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.notDelivery };
  }

  return { kind: CLOUDFLARE_IMAGES_DELIVERY_URL_KIND.owned, imageId };
}
