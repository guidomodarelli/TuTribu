/**
 * Shared flow of the member-only routes on one tribe subscription price: the
 * member scope wired from the route copy and the `{ priceId, slug }` log
 * metadata.
 *
 * @module price-member-route
 */

import {
  handleMemberRouteWithCopy,
  type MemberRouteCopy,
  type OpenMemberRouteScope,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";

/** Open member scope of a price route, with its route params. */
type PriceMemberRouteScope = OpenMemberRouteScope & { priceId: string; slug: string };

/**
 * Runs a member-only route on one tribe subscription price.
 *
 * @param request - Incoming request.
 * @param context - Route params with the tribe slug and the price id.
 * @param copy - Log and response copy of the route.
 * @param handle - Route body run with the open scope and the route params.
 * @returns The route response.
 */
export async function handlePriceMemberRoute(
  request: Request,
  context: TribeRouteContext<{ priceId: string }>,
  copy: MemberRouteCopy,
  handle: (scope: PriceMemberRouteScope) => Promise<Response>
): Promise<Response> {
  const { priceId, slug } = await context.params;

  return handleMemberRouteWithCopy(request, copy, { priceId, slug }, (scope) =>
    handle({ ...scope, priceId, slug })
  );
}
