const MESSAGE_POLL_REOPEN_ROUTE_RESPONSE = {
  unavailableMessage: "La encuesta forma parte del mensaje.",
} as const;

const HTTP_STATUS = {
  notFound: 404,
} as const;

export async function POST() {
  return Response.json(
    { message: MESSAGE_POLL_REOPEN_ROUTE_RESPONSE.unavailableMessage },
    { status: HTTP_STATUS.notFound }
  );
}
