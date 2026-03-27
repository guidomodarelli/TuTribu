import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";

export function buildGoogleAuthRedirectUrl(
  callbackUrl: string,
  origin: string
): string {
  const redirectUrl = new URL(ROUTES.auth.callback, origin);
  redirectUrl.searchParams.set(QUERY_PARAMS.auth.next, callbackUrl);
  return redirectUrl.toString();
}
