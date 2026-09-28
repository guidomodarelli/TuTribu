/**
 * Browser adapter of the academy and verification route handlers. Every
 * successful body is checked with `safeParse` against its public DTO schema;
 * a network failure, an unusable body or an error status becomes a failure
 * with the safe Spanish message sent by the route (or a fallback).
 *
 * @module academy-api-client
 */

import type { z } from "zod";

import {
  academyAccessStatusDtoSchema,
  academyBonusResultDtoSchema,
  academyCheckoutDtoSchema,
  academyMembersPageDtoSchema,
  academySettingsDtoSchema,
  type AcademyAccessStatusDto,
  type AcademyMembersPageDto,
  type AcademySettingsDto,
} from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import {
  memberVerificationDtoSchema,
  reviewQueueDtoSchema,
  reviewQueueItemDtoSchema,
  verificationProviderDtoSchema,
  type MemberVerificationDto,
  type ReviewQueueItemDto,
  type VerificationProviderDto,
} from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";

export const ACADEMY_API_FALLBACK_MESSAGE =
  "No pudimos completar la acción. Intentá de nuevo.";

const HTTP_METHOD = {
  delete: "DELETE",
  get: "GET",
  patch: "PATCH",
  post: "POST",
  put: "PUT",
} as const;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const NO_STORE_CACHE: RequestCache = "no-store";
const HTTP_STATUS_CONFLICT = 409;

const API_PATH = {
  academy: "/academy",
  activation: "/activation",
  availability: "/availability",
  bonuses: "/bonuses",
  checkout: "/checkout",
  currentSubscription: "/subscriptions/current",
  join: "/join",
  members: "/members",
  providers: "/verification-providers",
  reconcile: "/reconcile",
  revoke: "/revoke",
  settings: "/settings",
  tribes: "/api/tribes/",
  access: "/access",
  verifications: "/verifications",
} as const;

const ACADEMY_PRODUCT_QUERY = "product=academy";

export type AcademyApiResult<TData> =
  | { data: TData; isSuccess: true; status: number }
  | {
      /** Current state sent with a conflict (409), when the route returns one. */
      conflictData?: TData;
      isSuccess: false;
      message: string;
      status: number;
    };

function tribePath(tribeSlug: string, path: string): string {
  return `${API_PATH.tribes}${encodeURIComponent(tribeSlug)}${path}`;
}

function readMessage(body: unknown): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return ACADEMY_API_FALLBACK_MESSAGE;
}

async function requestAcademyApi<TData>(input: {
  body?: unknown;
  method: (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD];
  path: string;
  schema: z.ZodType<TData> | null;
  signal?: AbortSignal;
}): Promise<AcademyApiResult<TData>> {
  let response: Response;

  try {
    response = await fetch(input.path, {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: NO_STORE_CACHE,
      headers: input.body === undefined ? undefined : JSON_HEADERS,
      method: input.method,
      signal: input.signal,
    });
  } catch {
    // Network failure or abort: the caller shows the safe fallback copy.
    return { isSuccess: false, message: ACADEMY_API_FALLBACK_MESSAGE, status: 0 };
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const conflict =
      response.status === HTTP_STATUS_CONFLICT && input.schema
        ? input.schema.safeParse(body)
        : null;

    return {
      ...(conflict?.success ? { conflictData: conflict.data } : {}),
      isSuccess: false,
      message: readMessage(body),
      status: response.status,
    };
  }

  if (!input.schema) {
    return { data: body as TData, isSuccess: true, status: response.status };
  }

  const parsed = input.schema.safeParse(body);

  return parsed.success
    ? { data: parsed.data, isSuccess: true, status: response.status }
    : { isSuccess: false, message: ACADEMY_API_FALLBACK_MESSAGE, status: response.status };
}

type MessageBody = { message?: string | null; status?: string };

export function joinAcademy(tribeSlug: string) {
  return requestAcademyApi<MessageBody>({
    method: HTTP_METHOD.post,
    path: tribePath(tribeSlug, API_PATH.academy + API_PATH.join),
    schema: null,
  });
}

export function fetchOwnAcademyAccess(tribeSlug: string, signal?: AbortSignal) {
  return requestAcademyApi<AcademyAccessStatusDto>({
    method: HTTP_METHOD.get,
    path: tribePath(tribeSlug, API_PATH.academy + API_PATH.access),
    schema: academyAccessStatusDtoSchema,
    signal,
  });
}

export function startAcademyCheckout(tribeSlug: string, acceptedOfferVersion: number) {
  return requestAcademyApi({
    body: { acceptedOfferVersion },
    method: HTTP_METHOD.post,
    path: tribePath(tribeSlug, API_PATH.academy + API_PATH.checkout),
    schema: academyCheckoutDtoSchema,
  });
}

export function reconcileAcademyCoverage(tribeSlug: string) {
  return requestAcademyApi<MessageBody>({
    method: HTTP_METHOD.post,
    path: tribePath(tribeSlug, API_PATH.academy + API_PATH.reconcile),
    schema: null,
  });
}

export function cancelAcademyRenewal(tribeSlug: string) {
  return requestAcademyApi<MessageBody>({
    method: HTTP_METHOD.delete,
    path: `${tribePath(tribeSlug, API_PATH.currentSubscription)}?${ACADEMY_PRODUCT_QUERY}`,
    schema: null,
  });
}

export function requestMemberVerification(
  tribeSlug: string,
  input: { declaredEmail: string; providerId: string }
) {
  return requestAcademyApi<MemberVerificationDto>({
    body: input,
    method: HTTP_METHOD.post,
    path: tribePath(tribeSlug, API_PATH.verifications),
    schema: memberVerificationDtoSchema,
  });
}

export function saveAcademyOffer(
  tribeSlug: string,
  input: { benefits: string[]; description: string; expectedConfigVersion: number; title: string }
) {
  return requestAcademyApi<AcademySettingsDto>({
    body: input,
    method: HTTP_METHOD.put,
    path: tribePath(tribeSlug, API_PATH.academy + API_PATH.settings),
    schema: academySettingsDtoSchema,
  });
}

/**
 * Switches the tribe to academy mode (active leader only). A 409 carries the
 * current settings as conflictData.
 */
export function activateAcademy(tribeSlug: string, expectedConfigVersion: number) {
  return requestAcademyApi<AcademySettingsDto>({
    body: { expectedConfigVersion },
    method: HTTP_METHOD.post,
    path: tribePath(tribeSlug, API_PATH.academy + API_PATH.activation),
    schema: academySettingsDtoSchema,
  });
}

export function setAcademyAvailability(
  tribeSlug: string,
  input: { admissionEnabled: boolean; expectedConfigVersion: number; salesEnabled: boolean }
) {
  return requestAcademyApi<AcademySettingsDto>({
    body: input,
    method: HTTP_METHOD.put,
    path: tribePath(tribeSlug, API_PATH.academy + API_PATH.availability),
    schema: academySettingsDtoSchema,
  });
}

export function saveVerificationProvider(
  tribeSlug: string,
  providerId: string | null,
  input: {
    displayName: string;
    instructions: string;
    isActive: boolean;
    key: string;
    linkUrl: string;
  }
) {
  return requestAcademyApi<VerificationProviderDto>({
    body: input,
    method: providerId ? HTTP_METHOD.patch : HTTP_METHOD.post,
    path: tribePath(
      tribeSlug,
      providerId
        ? `${API_PATH.providers}/${encodeURIComponent(providerId)}`
        : API_PATH.providers
    ),
    schema: verificationProviderDtoSchema,
  });
}

export function fetchVerificationReviewQueue(
  tribeSlug: string,
  query: { page: number; search: string; status: string },
  signal?: AbortSignal
) {
  const searchParams = new URLSearchParams({ page: String(query.page), scope: "review" });

  if (query.search.trim()) {
    searchParams.set("search", query.search.trim());
  }

  if (query.status) {
    searchParams.set("status", query.status);
  }

  return requestAcademyApi({
    method: HTTP_METHOD.get,
    path: `${tribePath(tribeSlug, API_PATH.verifications)}?${searchParams.toString()}`,
    schema: reviewQueueDtoSchema,
    signal,
  });
}

export function decideMemberVerification(
  tribeSlug: string,
  verificationId: string,
  input: { decision: "rejected" | "revoked" | "verified"; expectedVersion: number; reason: string }
) {
  return requestAcademyApi<ReviewQueueItemDto>({
    body: input,
    method: HTTP_METHOD.patch,
    path: tribePath(tribeSlug, `${API_PATH.verifications}/${encodeURIComponent(verificationId)}`),
    schema: reviewQueueItemDtoSchema,
  });
}

export function fetchAcademyMembers(
  tribeSlug: string,
  query: { page: number; search: string },
  signal?: AbortSignal
) {
  const searchParams = new URLSearchParams({ page: String(query.page) });

  if (query.search.trim()) {
    searchParams.set("search", query.search.trim());
  }

  return requestAcademyApi<AcademyMembersPageDto>({
    method: HTTP_METHOD.get,
    path: `${tribePath(tribeSlug, API_PATH.academy + API_PATH.members)}?${searchParams.toString()}`,
    schema: academyMembersPageDtoSchema,
    signal,
  });
}

export function grantAcademyBonus(
  tribeSlug: string,
  input: {
    allowUnverifiedRecipient: boolean;
    endsAt: string;
    idempotencyKey: string;
    reason: string;
    recipientUserId: string;
  }
) {
  return requestAcademyApi({
    body: { ...input, replacesGrantId: null },
    method: HTTP_METHOD.post,
    path: tribePath(tribeSlug, API_PATH.academy + API_PATH.bonuses),
    schema: academyBonusResultDtoSchema,
  });
}

export function revokeAcademyBonus(tribeSlug: string, grantId: string, reason: string) {
  return requestAcademyApi<MessageBody>({
    body: { reason },
    method: HTTP_METHOD.post,
    path: tribePath(
      tribeSlug,
      `${API_PATH.academy}${API_PATH.bonuses}/${encodeURIComponent(grantId)}${API_PATH.revoke}`
    ),
    schema: null,
  });
}
