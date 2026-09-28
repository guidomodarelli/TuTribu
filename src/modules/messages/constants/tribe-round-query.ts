/**
 * Query parameters that select the visible round page: the tribe page URL
 * (`/[slug]?channel=&page=`), its client-side history mirror, and
 * `GET /api/tribes/[slug]/messages` share these names so a deep link and an
 * in-place navigation always describe the same page.
 */
export const TRIBE_ROUND_QUERY_PARAM = {
  channel: "channel",
  page: "page",
} as const;

/** Page shown when the query carries no `page`, and never written to the URL. */
export const TRIBE_ROUND_FIRST_PAGE = 1;
