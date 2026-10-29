import { HTTP_STATUS } from "@/app/api/route-http-status";

const MESSAGE_POLL_CLOSE_ROUTE_RESPONSE = {
  unavailableMessage: "La encuesta forma parte del mensaje.",
} as const;

export async function POST() {
  return Response.json(
    { message: MESSAGE_POLL_CLOSE_ROUTE_RESPONSE.unavailableMessage },
    { status: HTTP_STATUS.notFound }
  );
}
