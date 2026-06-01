const HTTPS_PROTOCOL = "https://";
const SAFARI_URL_SCHEME = "x-safari-https://";
const CHROME_ANDROID_NAVIGATION_URL_PREFIX = "googlechrome://navigate?url=";

export const EXTERNAL_BROWSER_PLATFORM = {
  android: "android",
  ios: "ios",
} as const;

export type ExternalBrowserPlatform =
  (typeof EXTERNAL_BROWSER_PLATFORM)[keyof typeof EXTERNAL_BROWSER_PLATFORM];

type BuildExternalBrowserUrlInput = {
  platform: ExternalBrowserPlatform;
  targetHttpsUrl: string;
};

/**
 * Builds a deep link that asks the OS to open the given https URL in the
 * user's default external browser instead of the in-app browser.
 *
 * @param input - Target URL and detected platform.
 * @returns A deep-link URL for iOS Safari or Android Chrome. Returns null when
 *          the target URL does not use the https scheme.
 */
export function buildExternalBrowserUrl({
  platform,
  targetHttpsUrl,
}: BuildExternalBrowserUrlInput): string | null {
  if (!targetHttpsUrl.startsWith(HTTPS_PROTOCOL)) {
    return null;
  }

  const urlWithoutScheme = targetHttpsUrl.slice(HTTPS_PROTOCOL.length);

  if (platform === EXTERNAL_BROWSER_PLATFORM.ios) {
    return SAFARI_URL_SCHEME + urlWithoutScheme;
  }

  return CHROME_ANDROID_NAVIGATION_URL_PREFIX + encodeURIComponent(targetHttpsUrl);
}
