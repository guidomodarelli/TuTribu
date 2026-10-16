/**
 * Shared contract between the UI test runner (`run-ui-tests.mjs`), the
 * Playwright UI config and the authenticated specs: the production server
 * origin and the environment variables that carry the seeded session.
 *
 * @module ui-test-environment
 */

/** Dedicated local port so validation cannot reuse an unrelated development server. */
export const UI_TEST_PORT = 3110;

/** Origin served by `next start` during `pnpm test:ui`; plain HTTP keeps the session cookie unprefixed. */
export const UI_TEST_ORIGIN = `http://127.0.0.1:${UI_TEST_PORT}`;

/**
 * Variables the runner exports to Playwright when an ephemeral database was
 * seeded. Specs that need a signed-in member skip when they are absent.
 */
export const UI_TEST_SESSION_ENV = {
  /** Signed Better Auth session cookie value, already URL-encoded. */
  sessionCookie: "E2E_SESSION_COOKIE",
  /** Slug of the tribe seeded for the dialog scenarios. */
  tribeSlug: "E2E_TRIBE_SLUG",
  /** Title of the round message seeded in the tribe. */
  messageTitle: "E2E_MESSAGE_TITLE",
  /** Signed session cookie of a tribemate, who sees the leader's messages without the actions menu. */
  tribemateSessionCookie: "E2E_TRIBEMATE_SESSION_COOKIE",
  /** Title of the leader's round message seeded with replies and likes. */
  discussedMessageTitle: "E2E_DISCUSSED_MESSAGE_TITLE",
  /** Title of the leader's round message seeded with likes and no replies. */
  likedMessageTitle: "E2E_LIKED_MESSAGE_TITLE",
  /** Title of the event seeded in the tribe. */
  eventTitle: "E2E_EVENT_TITLE",
};

/** Better Auth session cookie name over plain HTTP (no `__Secure-` prefix). */
export const UI_TEST_SESSION_COOKIE_NAME = "better-auth.session_token";
