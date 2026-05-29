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
    .split(",")
    .flatMap((value) => {
      const trimmedValue = value.trim();

      return trimmedValue ? [trimmedValue] : [];
    });

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
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);

    return response;
  } catch {
    const headers = new Headers(response.headers);

    headers.set(REQUEST_ID_HEADER, requestId);

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
}
