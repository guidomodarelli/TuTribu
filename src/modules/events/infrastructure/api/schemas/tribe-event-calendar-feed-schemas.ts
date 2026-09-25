import { z } from "zod";

import { TRIBE_EVENT_CALENDAR_FEED_TOKEN } from "@/src/modules/events/constants/tribe-event-calendar-feed";
import { tribeSlugParamSchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-fields";
import { TRIBE_EVENT_INPUT_ISSUE } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-issue";
import { tribeEventListQuerySchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";

/**
 * Input contracts of the public calendar feed
 * (`/api/calendar/tribes/[slug]/feed/[feedFile]`).
 */

/**
 * The 43 base64url characters of a 32-byte token.
 */
const FEED_TOKEN_PATTERN = new RegExp(
  "^[A-Za-z0-9_-]{" + TRIBE_EVENT_CALENDAR_FEED_TOKEN.encodedLength + "}$"
);

/**
 * `[feedFile]` segment: `<token>.ics`, the extension calendar apps expect.
 * Anything else never reaches the database.
 */
const feedTokenFromFileSchema = z
  .string({ error: TRIBE_EVENT_INPUT_ISSUE.invalidCalendarFeed })
  .refine((feedFile) => feedFile.endsWith(TRIBE_EVENT_CALENDAR_FEED_TOKEN.fileExtension), {
    error: TRIBE_EVENT_INPUT_ISSUE.invalidCalendarFeed,
  })
  .transform((feedFile) =>
    feedFile.slice(0, -TRIBE_EVENT_CALENDAR_FEED_TOKEN.fileExtension.length)
  )
  .pipe(
    z.string().regex(FEED_TOKEN_PATTERN, { error: TRIBE_EVENT_INPUT_ISSUE.invalidCalendarFeed })
  );

export const tribeEventCalendarFeedParamsSchema = z
  .object({
    feedFile: feedTokenFromFileSchema,
    slug: tribeSlugParamSchema,
  })
  .transform(({ feedFile, slug }) => ({ slug, token: feedFile }));

/**
 * Optional `?type=` of the feed, with the same rules as the listing API
 * (repeatable or CSV, unknown type rejected), so a member can subscribe to
 * some event types only.
 */
export const tribeEventCalendarFeedQuerySchema = tribeEventListQuerySchema.pick({ type: true });

/**
 * Body of `POST /api/tribes/[slug]/events/calendar-feed`: the id of the
 * subscription the client shows as active (null: none), the optimistic
 * precondition that makes duplicate regenerations safe. A missing or
 * malformed id means the client state is unusable, so it is asked to reload.
 */
export const tribeEventCalendarFeedIssueBodySchema = z.object(
  {
    expectedSubscriptionId: z
      .guid({ error: TRIBE_EVENT_INPUT_ISSUE.invalidCalendarFeedSubscription })
      .nullable(),
  },
  { error: TRIBE_EVENT_INPUT_ISSUE.invalidCalendarFeedSubscription }
);

export type TribeEventCalendarFeedIssueRequestBody = z.input<
  typeof tribeEventCalendarFeedIssueBodySchema
>;
