import { buildTribeRoundQueryString, type TribeRoundLocation } from "@/lib/messages/tribe-round-location";
import { ROUTES } from "@/src/constants/routes";
import {
  tribeRoundMessageResponseSchema,
  tribeRoundPageResponseSchema,
  type TribeRoundPageResponse,
} from "@/src/modules/messages/application/results/tribe-round-public-dto-schemas";

/**
 * Browser adapter of `GET /api/tribes/[slug]/messages`. It only knows the URL
 * and the response contract: a success body is checked with `safeParse`
 * against the public round schema (a body that does not match is a failure
 * without message, so the caller shows its own fallback copy). Network and
 * abort errors propagate to the caller, which owns cancellation and feedback.
 */

export type TribeRoundPageRequestResult =
  | { isSuccess: true; round: TribeRoundPageResponse["round"] }
  | { isSuccess: false; message: string | null };

const TRIBE_ROUND_ENDPOINT = {
  messagesPath: "/messages",
  querySeparator: "?",
  separator: "/",
} as const;

const NO_STORE_CACHE: RequestCache = "no-store";

/**
 * @param input - Tribe slug and the round location to load.
 * @returns Same-origin URL of the round page endpoint.
 */
function buildTribeRoundPageUrl({
  tribeSlug,
  ...location
}: TribeRoundLocation & { tribeSlug: string }): string {
  const endpointPath =
    ROUTES.api.tribes +
    TRIBE_ROUND_ENDPOINT.separator +
    encodeURIComponent(tribeSlug) +
    TRIBE_ROUND_ENDPOINT.messagesPath;
  const queryString = buildTribeRoundQueryString(location);

  return queryString ? endpointPath + TRIBE_ROUND_ENDPOINT.querySeparator + queryString : endpointPath;
}

/**
 * Loads one page of the round (channel filter plus page number).
 *
 * @param input - Tribe slug, channel slug (or `null` for every channel), page,
 * and the abort signal that cancels a superseded load.
 * @returns The validated round, or a failure with the server's safe message.
 */
export async function fetchTribeRoundPageRequest(
  input: TribeRoundLocation & { signal?: AbortSignal; tribeSlug: string }
): Promise<TribeRoundPageRequestResult> {
  const response = await fetch(
    buildTribeRoundPageUrl({
      channelSlug: input.channelSlug,
      page: input.page,
      tribeSlug: input.tribeSlug,
    }),
    { cache: NO_STORE_CACHE, signal: input.signal }
  );
  const body: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const dto = tribeRoundPageResponseSchema.safeParse(body);

    return dto.success ? { isSuccess: true, round: dto.data.round } : { isSuccess: false, message: null };
  }

  const failure = tribeRoundMessageResponseSchema.safeParse(body);

  return { isSuccess: false, message: failure.success ? failure.data.message : null };
}
