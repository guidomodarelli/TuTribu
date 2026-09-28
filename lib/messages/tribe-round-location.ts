import { ROUTES } from "@/src/constants/routes";
import {
  TRIBE_ROUND_FIRST_PAGE,
  TRIBE_ROUND_QUERY_PARAM,
} from "@/src/modules/messages/constants/tribe-round-query";

/**
 * Location of one round page inside the tribe home: which channel filter and
 * which page are shown. It is mirrored in the URL (`?channel=&page=`) so the
 * page stays shareable and Back/Forward walk through the visited pages.
 */
export type TribeRoundLocation = {
  channelSlug: string | null;
  page: number;
};

const QUERY_SEPARATOR = "?";
/** Whole positive number as written in the URL, mirroring the tribe page. */
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

/**
 * Query string of a round location: the channel when filtered and the page
 * only after the first one, the same shape the tribe page links always had.
 *
 * @param location - Channel slug (or `null` for every channel) and page.
 * @returns The query string without the leading `?` (empty for the defaults).
 */
export function buildTribeRoundQueryString({ channelSlug, page }: TribeRoundLocation): string {
  const searchParams = new URLSearchParams();

  if (channelSlug) {
    searchParams.set(TRIBE_ROUND_QUERY_PARAM.channel, channelSlug);
  }

  if (page > TRIBE_ROUND_FIRST_PAGE) {
    searchParams.set(TRIBE_ROUND_QUERY_PARAM.page, String(page));
  }

  return searchParams.toString();
}

/**
 * Shareable tribe home URL of a round page.
 *
 * @param input - Tribe slug, channel slug (or `null`), and page.
 * @returns `/[slug]` plus the round query when it differs from the defaults.
 */
export function buildTribeRoundPageHref({
  channelSlug,
  page,
  tribeSlug,
}: TribeRoundLocation & { tribeSlug: string }): string {
  const tribePath = ROUTES.tribes.bySlug(tribeSlug);
  const queryString = buildTribeRoundQueryString({ channelSlug, page });

  return queryString ? tribePath + QUERY_SEPARATOR + queryString : tribePath;
}

/**
 * Reads the round location from a URL query with the tribe page's lenient
 * rules: a blank channel means every channel and an invalid page is the
 * first one, so Back/Forward land on the same page a reload would render.
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns The round location described by the query.
 */
export function readTribeRoundLocation(search: string): TribeRoundLocation {
  const searchParams = new URLSearchParams(search);
  const channelSlug = searchParams.get(TRIBE_ROUND_QUERY_PARAM.channel)?.trim() ?? "";
  const rawPage = searchParams.get(TRIBE_ROUND_QUERY_PARAM.page) ?? "";
  const page = POSITIVE_INTEGER_PATTERN.test(rawPage) ? Number(rawPage) : TRIBE_ROUND_FIRST_PAGE;

  return {
    channelSlug: channelSlug.length > 0 ? channelSlug : null,
    page: Number.isSafeInteger(page) ? page : TRIBE_ROUND_FIRST_PAGE,
  };
}

/**
 * @param first - A round location.
 * @param second - Another round location.
 * @returns Whether both describe the same channel filter and page.
 */
export function isSameTribeRoundLocation(
  first: TribeRoundLocation,
  second: TribeRoundLocation
): boolean {
  return first.channelSlug === second.channelSlug && first.page === second.page;
}
