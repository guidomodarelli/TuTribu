const VERCEL_ENVIRONMENT_VARIABLE = "VERCEL";
const ENABLED_ENVIRONMENT_VALUE = "1";

type RuntimeEnvironment = Record<string, string | undefined>;

export function shouldInitializeOpenNextCloudflareForDev(
  environment: RuntimeEnvironment = process.env
): boolean {
  return environment[VERCEL_ENVIRONMENT_VARIABLE] !== ENABLED_ENVIRONMENT_VALUE;
}

export async function initializeOpenNextCloudflareForDev(): Promise<void> {
  if (!shouldInitializeOpenNextCloudflareForDev()) {
    return;
  }

  const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");

  await initOpenNextCloudflareForDev();
}
