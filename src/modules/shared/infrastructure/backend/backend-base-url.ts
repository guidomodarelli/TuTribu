const BACKEND_BASE_URL_ENV = "LATRIBU_BACKEND_BASE_URL";
const HTTP_PROTOCOL = "http:";
const HTTPS_PROTOCOL = "https:";
const LOCALHOST_HOSTNAME = "localhost";
const LOCAL_LOOPBACK_HOSTNAME = "127.0.0.1";
const PATH_SEPARATOR = "/";
const BACKEND_BASE_URL_ERROR_SUFFIX = {
  httpsOrLocalhost: " must use https, or http only for localhost",
  validAbsoluteUrl: " must be a valid absolute URL",
} as const;

function trimTrailingSlash(value: string): string {
  return value.endsWith(PATH_SEPARATOR) ? value.slice(0, -1) : value;
}

export function resolveBackendBaseUrl(): string | null {
  const rawBaseUrl = process.env[BACKEND_BASE_URL_ENV];

  if (!rawBaseUrl) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error(
      BACKEND_BASE_URL_ENV + BACKEND_BASE_URL_ERROR_SUFFIX.validAbsoluteUrl
    );
  }

  const isHttps = parsedUrl.protocol === HTTPS_PROTOCOL;
  const isLocalHttp =
    parsedUrl.protocol === HTTP_PROTOCOL &&
    (parsedUrl.hostname === LOCALHOST_HOSTNAME ||
      parsedUrl.hostname === LOCAL_LOOPBACK_HOSTNAME);

  if (!isHttps && !isLocalHttp) {
    throw new Error(
      BACKEND_BASE_URL_ENV + BACKEND_BASE_URL_ERROR_SUFFIX.httpsOrLocalhost
    );
  }

  return trimTrailingSlash(parsedUrl.toString());
}
