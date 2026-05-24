const HTTPS_PROTOCOL = "https://";
const SAFARI_URL_SCHEME = "x-safari-https://";
const INTENT_URL_PREFIX = "intent://";
const INTENT_URL_SUFFIX =
  "#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";

export type ExternalBrowserPlatform = "ios" | "android";

type BuildExternalBrowserUrlInput = {
  platform: ExternalBrowserPlatform;
  targetHttpsUrl: string;
};

/**
 * Builds a deep link that asks the OS to open the given https URL in the
 * user's default external browser instead of the in-app browser.
 *
 * @param input - Target URL and detected platform.
 * @returns A deep-link URL for iOS Safari or an Android Intent URI. Returns
 *          null when the target URL does not use the https scheme.
 */
export function buildExternalBrowserUrl({
  platform,
  targetHttpsUrl,
}: BuildExternalBrowserUrlInput): string | null {
  if (!targetHttpsUrl.startsWith(HTTPS_PROTOCOL)) {
    return null;
  }

  const urlWithoutScheme = targetHttpsUrl.slice(HTTPS_PROTOCOL.length);

  if (platform === "ios") {
    return SAFARI_URL_SCHEME + urlWithoutScheme;
  }

  return INTENT_URL_PREFIX + urlWithoutScheme + INTENT_URL_SUFFIX;
}
