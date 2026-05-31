export const REQUEST_ID_HEADER = "x-request-id";
export const TRACE_ID_HEADER = "x-trace-id";

export type RequestContext = {
  requestId: string;
  traceId: string;
};

type HeadersLike = {
  get(name: string): string | null;
};

function buildRequestId(): string {
  return crypto.randomUUID();
}

function readFirstHeaderValue(
  headersLike: HeadersLike | null | undefined,
  headerName: string
): string | null {
  const rawHeader = headersLike?.get(headerName)?.trim() ?? "";

  if (!rawHeader) {
    return null;
  }

  const [headerValue] = rawHeader
    .split(",")
    .flatMap((value) => {
      const trimmedValue = value.trim();

      return trimmedValue ? [trimmedValue] : [];
    });

  return headerValue ?? null;
}

export function resolveRequestContext(headersLike?: HeadersLike | null): RequestContext {
  const requestId = readFirstHeaderValue(headersLike, REQUEST_ID_HEADER) ?? buildRequestId();

  return {
    requestId,
    traceId: readFirstHeaderValue(headersLike, TRACE_ID_HEADER) ?? requestId,
  };
}

function attachHeadersToResponse(
  response: Response,
  headersToAttach: Record<string, string>
): Response {
  try {
    Object.entries(headersToAttach).forEach(([headerName, headerValue]) => {
      response.headers.set(headerName, headerValue);
    });

    return response;
  } catch {
    const headers = new Headers(response.headers);

    Object.entries(headersToAttach).forEach(([headerName, headerValue]) => {
      headers.set(headerName, headerValue);
    });

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
}

export function attachRequestContextToResponse(
  response: Response,
  requestContext: RequestContext
): Response {
  return attachHeadersToResponse(response, {
    [REQUEST_ID_HEADER]: requestContext.requestId,
    [TRACE_ID_HEADER]: requestContext.traceId,
  });
}

export function attachRequestIdToResponse(
  response: Response,
  requestId: string
): Response {
  return attachRequestContextToResponse(response, {
    requestId,
    traceId: requestId,
  });
}
