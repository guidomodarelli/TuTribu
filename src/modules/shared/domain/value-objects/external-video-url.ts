import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/shared/domain/value-objects/video-provider";

const NUMERIC_ID_PATTERN = /^\d+$/;
const VIMEO_HASH_PATTERN = /^[a-zA-Z0-9]+$/;
const WISTIA_ID_PATTERN = /^[a-z0-9]{10,}$/i;
const LOOM_ID_PATTERN = /^[a-f0-9]{32}$/i;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const VIMEO_ID_HASH_SEPARATOR = ":";
const VIMEO_HASH_QUERY_PARAM = "h";
const YOUTUBE_VIDEO_QUERY_PARAM = "v";

const VIMEO_VIDEO_PATH_SEGMENT = "video";
const WISTIA_MEDIAS_PATH_SEGMENT = "medias";
const WISTIA_EMBED_PATH_SEGMENT = "embed";
const WISTIA_EMBED_IFRAME_PATH_SEGMENT = "iframe";
const LOOM_SHARE_PATH_SEGMENT = "share";
const LOOM_EMBED_PATH_SEGMENT = "embed";
const YOUTUBE_EMBED_PATH_SEGMENT = "embed";
const YOUTUBE_SHORTS_PATH_SEGMENT = "shorts";
const YOUTUBE_WATCH_PATH_SEGMENT = "watch";

const VIMEO_HOST_PATTERN = /^(?:player\.)?vimeo\.com$/i;
const WISTIA_HOST_PATTERN = /^(?:[a-z0-9-]+\.)?wistia\.(?:com|net)$/i;
const LOOM_HOST_PATTERN = /^(?:www\.)?loom\.com$/i;
const YOUTUBE_HOST_PATTERN = /^(?:www\.|m\.)?youtube\.com$/i;
const YOUTUBE_SHORT_HOST = "youtu.be";

const INVALID_VIDEO_URL_MESSAGE_PREFIX = "Invalid external video URL: ";
const INVALID_VIDEO_URL_ERROR_NAME = "InvalidVideoUrlError";

export type ParsedExternalVideo = {
  externalId: string;
  provider: VideoProvider;
};

export class InvalidVideoUrlError extends Error {
  constructor(input: string) {
    super(`${INVALID_VIDEO_URL_MESSAGE_PREFIX}${input}`);
    this.name = INVALID_VIDEO_URL_ERROR_NAME;
  }
}

function getPathSegments(url: URL): string[] {
  return url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function extractVimeo(url: URL): string | null {
  const segments = getPathSegments(url);
  const videoSegmentIndex = segments.findIndex(
    (segment) => segment === VIMEO_VIDEO_PATH_SEGMENT
  );
  const idIndex = videoSegmentIndex >= 0 ? videoSegmentIndex + 1 : 0;
  const idCandidate = segments[idIndex];

  if (!idCandidate || !NUMERIC_ID_PATTERN.test(idCandidate)) {
    return null;
  }

  const hashFromPath = segments[idIndex + 1];
  const hashFromQuery = url.searchParams.get(VIMEO_HASH_QUERY_PARAM);
  const hash =
    hashFromPath && VIMEO_HASH_PATTERN.test(hashFromPath)
      ? hashFromPath
      : hashFromQuery && VIMEO_HASH_PATTERN.test(hashFromQuery)
        ? hashFromQuery
        : null;

  return hash
    ? `${idCandidate}${VIMEO_ID_HASH_SEPARATOR}${hash}`
    : idCandidate;
}

function extractWistia(url: URL): string | null {
  const segments = getPathSegments(url);
  const mediasIndex = segments.findIndex(
    (segment) => segment === WISTIA_MEDIAS_PATH_SEGMENT
  );
  const iframeIndex = segments.findIndex(
    (segment) => segment === WISTIA_EMBED_IFRAME_PATH_SEGMENT
  );
  const embedIndex = segments.findIndex(
    (segment) => segment === WISTIA_EMBED_PATH_SEGMENT
  );

  let idCandidate: string | undefined;
  if (mediasIndex >= 0) {
    idCandidate = segments[mediasIndex + 1];
  } else if (iframeIndex >= 0) {
    idCandidate = segments[iframeIndex + 1];
  } else if (embedIndex >= 0) {
    idCandidate = segments[embedIndex + 1];
  }

  if (!idCandidate || !WISTIA_ID_PATTERN.test(idCandidate)) {
    return null;
  }

  return idCandidate;
}

function extractLoom(url: URL): string | null {
  const segments = getPathSegments(url);
  const shareIndex = segments.findIndex(
    (segment) =>
      segment === LOOM_SHARE_PATH_SEGMENT ||
      segment === LOOM_EMBED_PATH_SEGMENT
  );

  if (shareIndex < 0) {
    return null;
  }

  const idCandidate = segments[shareIndex + 1];
  if (!idCandidate || !LOOM_ID_PATTERN.test(idCandidate)) {
    return null;
  }

  return idCandidate;
}

function extractYoutube(url: URL): string | null {
  if (url.hostname.toLowerCase() === YOUTUBE_SHORT_HOST) {
    const [first] = getPathSegments(url);
    return first && YOUTUBE_ID_PATTERN.test(first) ? first : null;
  }

  const segments = getPathSegments(url);
  const watchSegment = segments.find(
    (segment) => segment === YOUTUBE_WATCH_PATH_SEGMENT
  );

  if (watchSegment) {
    const idCandidate = url.searchParams.get(YOUTUBE_VIDEO_QUERY_PARAM);
    return idCandidate && YOUTUBE_ID_PATTERN.test(idCandidate)
      ? idCandidate
      : null;
  }

  const embedIndex = segments.findIndex(
    (segment) =>
      segment === YOUTUBE_EMBED_PATH_SEGMENT ||
      segment === YOUTUBE_SHORTS_PATH_SEGMENT
  );

  if (embedIndex >= 0) {
    const idCandidate = segments[embedIndex + 1];
    return idCandidate && YOUTUBE_ID_PATTERN.test(idCandidate)
      ? idCandidate
      : null;
  }

  return null;
}

function detectAndExtract(url: URL): ParsedExternalVideo | null {
  const hostname = url.hostname;

  if (VIMEO_HOST_PATTERN.test(hostname)) {
    const externalId = extractVimeo(url);
    return externalId ? { externalId, provider: VIDEO_PROVIDER.vimeo } : null;
  }

  if (WISTIA_HOST_PATTERN.test(hostname)) {
    const externalId = extractWistia(url);
    return externalId ? { externalId, provider: VIDEO_PROVIDER.wistia } : null;
  }

  if (LOOM_HOST_PATTERN.test(hostname)) {
    const externalId = extractLoom(url);
    return externalId ? { externalId, provider: VIDEO_PROVIDER.loom } : null;
  }

  if (
    YOUTUBE_HOST_PATTERN.test(hostname) ||
    hostname.toLowerCase() === YOUTUBE_SHORT_HOST
  ) {
    const externalId = extractYoutube(url);
    return externalId
      ? { externalId, provider: VIDEO_PROVIDER.youtube }
      : null;
  }

  return null;
}

export function parseExternalVideoUrl(rawInput: string): ParsedExternalVideo {
  const trimmed = rawInput.trim();

  if (trimmed.length === 0) {
    throw new InvalidVideoUrlError(rawInput);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidVideoUrlError(rawInput);
  }

  const parsed = detectAndExtract(url);
  if (!parsed) {
    throw new InvalidVideoUrlError(rawInput);
  }

  return parsed;
}
