const CLOUDFLARE_IMAGES_ENV = {
  accountHash: "CLOUDFLARE_IMAGES_ACCOUNT_HASH",
  accountId: "CLOUDFLARE_ACCOUNT_ID",
  apiToken: "CLOUDFLARE_IMAGES_API_TOKEN",
  deliveryVariant: "CLOUDFLARE_IMAGES_DELIVERY_VARIANT",
} as const;

const CLOUDFLARE_IMAGES_DEFAULTS = {
  deliveryVariant: "public",
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
  return `https://imagedelivery.net/${accountHash}/${imageId}/${deliveryVariant}`;
}
