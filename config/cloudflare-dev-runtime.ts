import {
  type RuntimeEnvironment,
  isVercelEnvironment,
} from "./deployment-environment";

export function shouldInitializeOpenNextCloudflareForDev(
  environment: RuntimeEnvironment = process.env
): boolean {
  return !isVercelEnvironment(environment);
}

export async function initializeOpenNextCloudflareForDev(): Promise<void> {
  if (!shouldInitializeOpenNextCloudflareForDev()) {
    return;
  }

  const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");

  await initOpenNextCloudflareForDev();
}
