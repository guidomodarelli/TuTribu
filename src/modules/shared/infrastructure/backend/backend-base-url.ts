const BACKEND_BASE_URL_ENV = "ACADEMIA_BACKEND_BASE_URL";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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
    throw new Error(`${BACKEND_BASE_URL_ENV} must be a valid absolute URL`);
  }

  const isHttps = parsedUrl.protocol === "https:";
  const isLocalHttp =
    parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1");

  if (!isHttps && !isLocalHttp) {
    throw new Error(
      `${BACKEND_BASE_URL_ENV} must use https, or http only for localhost`
    );
  }

  return trimTrailingSlash(parsedUrl.toString());
}
