"use client";

import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";

const URL_QUERY_SEPARATOR = "?";

export function navigateToGoogleAuthStart(callbackUrl: string) {
  const searchParams = new URLSearchParams({
    [QUERY_PARAMS.auth.next]: callbackUrl,
  });

  window.location.assign(
    ROUTES.auth.googleStart + URL_QUERY_SEPARATOR + searchParams.toString()
  );
}
