const REQUEST_ID_SEPARATOR = ",";

export const REQUEST_ID_HEADER = "x-request-id";

export type RequestContext = {
  requestId: string;
};

type HeadersLike = {
  get(name: string): string | null;
};

function buildRequestId(): string {
  return crypto.randomUUID();
}

function readRequestId(headersLike?: HeadersLike | null): string | null {
  const rawHeader = headersLike?.get(REQUEST_ID_HEADER)?.trim() ?? "";

  if (!rawHeader) {
    return null;
  }

  const [requestId] = rawHeader
    .split(REQUEST_ID_SEPARATOR)
    .map((value) => value.trim())
    .filter(Boolean);

  return requestId ?? null;
}

export function resolveRequestContext(headersLike?: HeadersLike | null): RequestContext {
  return {
    requestId: readRequestId(headersLike) ?? buildRequestId(),
  };
}

export function attachRequestIdToResponse(
  response: Response,
  requestId: string
): Response {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
