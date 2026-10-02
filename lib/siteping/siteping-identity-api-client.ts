/**
 * Browser adapter of `GET /api/siteping/identity`. It only knows the URL and
 * the response contract: a success body is checked with `safeParse` against
 * the public DTO schema owned by the siteping application layer, and every
 * other outcome becomes a typed result. It never throws, so the provider only
 * decides what to mount and which feedback to show.
 *
 * @module siteping-identity-api-client
 */

import type { SitepingIdentityResult } from "@/src/modules/siteping/application/results/siteping-feedback-result";
import { sitepingIdentityResultSchema } from "@/src/modules/siteping/application/results/siteping-identity-public-dto-schemas";
import { SITEPING_IDENTITY_ENDPOINT } from "@/src/modules/siteping/constants/siteping";

export const SITEPING_IDENTITY_REQUEST_RESULT = {
  denied: "denied",
  failed: "failed",
  loaded: "loaded",
} as const;

export const SITEPING_IDENTITY_FAILURE_REASON = {
  httpStatus: "http_status",
  network: "network",
  publicDtoRejected: "public_dto_rejected",
} as const;

export type SitepingIdentityFailureReason = "http_status" | "network" | "public_dto_rejected";

export type SitepingIdentityRequestResult =
  | { kind: "denied" }
  | { kind: "failed"; reason: SitepingIdentityFailureReason; status?: number }
  | { identity: SitepingIdentityResult; kind: "loaded" };

/** Expected identity-access rejections are not dependency failures. */
const SITEPING_IDENTITY_DENIED_HTTP_STATUS = { forbidden: 403, unauthorized: 401 } as const;

/**
 * Reads the public identity that decides whether the reporting widget mounts.
 *
 * @param input - Abort signal owned by the provider effect.
 * @returns Loaded identity, denied access, or a classified failure.
 */
export async function fetchSitepingIdentityRequest(input: {
  signal: AbortSignal;
}): Promise<SitepingIdentityRequestResult> {
  let response: Response;

  try {
    response = await fetch(SITEPING_IDENTITY_ENDPOINT, { signal: input.signal });
  } catch {
    // Network failures and aborted requests are classified; the provider
    // ignores them once its effect was cleaned up.
    return { kind: SITEPING_IDENTITY_REQUEST_RESULT.failed, reason: SITEPING_IDENTITY_FAILURE_REASON.network };
  }

  if (
    response.status === SITEPING_IDENTITY_DENIED_HTTP_STATUS.unauthorized ||
    response.status === SITEPING_IDENTITY_DENIED_HTTP_STATUS.forbidden
  ) {
    return { kind: SITEPING_IDENTITY_REQUEST_RESULT.denied };
  }

  if (!response.ok) {
    return {
      kind: SITEPING_IDENTITY_REQUEST_RESULT.failed,
      reason: SITEPING_IDENTITY_FAILURE_REASON.httpStatus,
      status: response.status,
    };
  }

  const body: unknown = await response.json().catch(() => null);
  const dto = sitepingIdentityResultSchema.safeParse(body);

  if (!dto.success) {
    return {
      kind: SITEPING_IDENTITY_REQUEST_RESULT.failed,
      reason: SITEPING_IDENTITY_FAILURE_REASON.publicDtoRejected,
    };
  }

  return { identity: dto.data, kind: SITEPING_IDENTITY_REQUEST_RESULT.loaded };
}
