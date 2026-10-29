/**
 * Shared flow of the member-only mutations on one message: the member scope
 * wired from the route copy, the `{ messageId, slug }` log metadata and the
 * 404 answered for a message id that is not a UUID.
 *
 * @module message-member-route
 */

import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import {
  createRouteJsonResponse,
  handleMemberRouteWithCopy,
  type MemberRouteCopy,
  type OpenMemberRouteScope,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

/** Route copy of a message mutation, with the 404 copy of an unknown message. */
type MessageMemberRouteCopy = MemberRouteCopy & {
  response: { notFoundMessage: string };
};

/** Open member scope of a message route, with its route params. */
type MessageMemberRouteScope = OpenMemberRouteScope & { messageId: string; slug: string };

/**
 * Runs a member-only mutation on one message.
 *
 * @param request - Incoming request.
 * @param context - Route params with the tribe slug and the message id.
 * @param copy - Log and response copy of the route.
 * @param handle - Route body, run only for a UUID message id.
 * @returns The route response.
 */
export async function handleMessageMemberRoute(
  request: Request,
  context: TribeRouteContext<{ messageId: string }>,
  copy: MessageMemberRouteCopy,
  handle: (scope: MessageMemberRouteScope) => Promise<Response>
): Promise<Response> {
  const { messageId, slug } = await context.params;

  return handleMemberRouteWithCopy(request, copy, { messageId, slug }, async (scope) => {
    if (!isUuidRouteParam(messageId)) {
      return createRouteJsonResponse(
        { message: copy.response.notFoundMessage },
        HTTP_STATUS.notFound
      );
    }

    return handle({ ...scope, messageId, slug });
  });
}
