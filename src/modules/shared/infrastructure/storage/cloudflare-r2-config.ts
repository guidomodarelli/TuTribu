const CLOUDFLARE_R2_ENV = {
  accessKeyId: "CLOUDFLARE_R2_ACCESS_KEY_ID",
  accountId: "CLOUDFLARE_ACCOUNT_ID",
  bucketName: "CLOUDFLARE_R2_BUCKET_NAME",
  secretAccessKey: "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
} as const;

export type CloudflareR2Environment = {
  accessKeyId: string;
  accountId: string;
  bucketName: string;
  secretAccessKey: string;
};

function readRequiredEnvironmentValue(name: string): string | null {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

/**
 * Reads the Cloudflare R2 credentials used for file attachments from the
 * environment, mirroring {@link readCloudflareImagesEnvironment}: a missing or
 * blank variable disables the integration instead of throwing, so callers map
 * the absence to a safe domain status.
 *
 * @returns The R2 environment, or `null` when any credential is missing.
 */
export function readCloudflareR2Environment(): CloudflareR2Environment | null {
  const accessKeyId = readRequiredEnvironmentValue(
    CLOUDFLARE_R2_ENV.accessKeyId
  );
  const accountId = readRequiredEnvironmentValue(CLOUDFLARE_R2_ENV.accountId);
  const bucketName = readRequiredEnvironmentValue(CLOUDFLARE_R2_ENV.bucketName);
  const secretAccessKey = readRequiredEnvironmentValue(
    CLOUDFLARE_R2_ENV.secretAccessKey
  );

  if (!accessKeyId || !accountId || !bucketName || !secretAccessKey) {
    return null;
  }

  return { accessKeyId, accountId, bucketName, secretAccessKey };
}
