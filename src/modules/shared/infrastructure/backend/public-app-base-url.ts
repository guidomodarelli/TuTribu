import "server-only";

const PUBLIC_APP_BASE_URL_ENV = "BETTER_AUTH_URL";
const HTTP_PROTOCOL = "http:";
const HTTPS_PROTOCOL = "https:";
const LOCALHOST_HOSTNAME = "localhost";
const LOCAL_LOOPBACK_HOSTNAME = "127.0.0.1";
const PUBLIC_APP_BASE_URL_ERROR_SUFFIX = {
  httpsOrLocalhost: " must use https, or http only for localhost",
  required: " is required to build public app links",
  validAbsoluteUrl: " must be a valid absolute URL",
} as const;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function resolvePublicAppBaseUrl(): string {
  const rawBaseUrl = process.env[PUBLIC_APP_BASE_URL_ENV];

  if (!rawBaseUrl) {
    throw new Error(
      PUBLIC_APP_BASE_URL_ENV + PUBLIC_APP_BASE_URL_ERROR_SUFFIX.required
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error(
      PUBLIC_APP_BASE_URL_ENV + PUBLIC_APP_BASE_URL_ERROR_SUFFIX.validAbsoluteUrl
    );
  }

  const isHttps = parsedUrl.protocol === HTTPS_PROTOCOL;
  const isLocalHttp =
    parsedUrl.protocol === HTTP_PROTOCOL &&
    (parsedUrl.hostname === LOCALHOST_HOSTNAME ||
      parsedUrl.hostname === LOCAL_LOOPBACK_HOSTNAME);

  if (!isHttps && !isLocalHttp) {
    throw new Error(
      PUBLIC_APP_BASE_URL_ENV +
        PUBLIC_APP_BASE_URL_ERROR_SUFFIX.httpsOrLocalhost
    );
  }

  return trimTrailingSlash(parsedUrl.toString());
}
