const MESSAGE_POLL_ROUTE_RESPONSE = {
  unavailableMessage: "La encuesta forma parte del mensaje.",
} as const;

const HTTP_STATUS = {
  notFound: 404,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function PATCH() {
  return createJsonResponse(
    { message: MESSAGE_POLL_ROUTE_RESPONSE.unavailableMessage },
    HTTP_STATUS.notFound
  );
}

export async function DELETE() {
  return createJsonResponse(
    { message: MESSAGE_POLL_ROUTE_RESPONSE.unavailableMessage },
    HTTP_STATUS.notFound
  );
}
