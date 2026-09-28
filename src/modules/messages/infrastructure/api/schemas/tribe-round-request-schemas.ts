import { z } from "zod";

import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";

/**
 * Input contracts of `GET /api/tribes/[slug]/messages`: the route validates
 * its params and query once, at its boundary, and hands the typed output to
 * the round use case. Each rule declares a stable category (never a Zod
 * message) that the route maps to safe Spanish copy.
 */

export const TRIBE_ROUND_INPUT_ISSUE = {
  invalidRoundPage: "invalid_round_page",
  invalidTribeReference: "invalid_tribe_reference",
} as const;

export type TribeRoundInputIssue =
  | typeof TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage
  | typeof TRIBE_ROUND_INPUT_ISSUE.invalidTribeReference;

/**
 * Canonical channel slug: lowercase ASCII words joined by single hyphens, the
 * only shape the channel repository generates from a channel name.
 */
const TRIBE_CHANNEL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Upper bound for a channel slug read from the query (names allow 30 chars). */
const TRIBE_CHANNEL_SLUG_MAX_LENGTH = 100;
/** Whole positive number as written in the URL: no sign, zero, decimals, or exponent. */
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export const tribeRoundRouteParamsSchema = z.object({
  slug: z
    .string()
    .regex(TRIBE_SLUG_PATTERN, { error: TRIBE_ROUND_INPUT_ISSUE.invalidTribeReference }),
});

/**
 * `?channel=&page=` of the round endpoint. A missing channel lists every
 * channel and a missing page is the first one; unlike the page (which falls
 * back to those defaults), the API rejects a malformed value with a 400.
 */
export const tribeRoundQuerySchema = z.object({
  channel: z
    .string({ error: TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage })
    .max(TRIBE_CHANNEL_SLUG_MAX_LENGTH, { error: TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage })
    .regex(TRIBE_CHANNEL_SLUG_PATTERN, { error: TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage })
    .optional(),
  page: z
    .string({ error: TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage })
    .regex(POSITIVE_INTEGER_PATTERN, { error: TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage })
    .transform(Number)
    .pipe(z.int({ error: TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage }).positive())
    .optional(),
});

export type TribeRoundQuery = z.infer<typeof tribeRoundQuerySchema>;
