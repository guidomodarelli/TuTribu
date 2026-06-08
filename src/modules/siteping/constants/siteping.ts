export const SITEPING_PROJECT = {
  defaultName: "tutribu",
} as const;

export const SITEPING_FEEDBACK_TYPE = {
  bug: "bug",
  change: "change",
  other: "other",
  question: "question",
} as const;

export const SITEPING_FEEDBACK_STATUS = {
  open: "open",
  resolved: "resolved",
} as const;

export const SITEPING_FEEDBACK_GITHUB_STATUS = {
  deletionCompleted: "deletion_completed",
  deletionPending: "deletion_pending",
  failed: "failed",
  pending: "pending",
  published: "published",
  skipped: "skipped",
} as const;

export const SITEPING_API_ENDPOINT = "/api/siteping";
export const SITEPING_IDENTITY_ENDPOINT = "/api/siteping/identity";

/**
 * Upper bound, in milliseconds, on how long after a feedback is created its
 * screenshot's non-idempotent Cloudflare create could still be in flight.
 *
 * The screenshot upload runs during feedback creation with a bounded client
 * timeout (5s) and no retry, but once the client aborts a slow response
 * Cloudflare may still finish creating the image server-side — and for a
 * multi-MB screenshot the request body itself may still be uploading when the
 * client gives up, so finalization can land seconds later. While the create may
 * still be running, a screenshot `DELETE` that returns `404` can be the delete
 * racing ahead of a create that has not appeared yet, not proof the image is
 * gone; trusting it would let feedback deletion remove the only row referencing
 * a soon-to-exist public image and strand an orphan with nothing to drive its
 * cleanup.
 *
 * The window is measured from `created_at` and is deliberately generous — well
 * beyond the 5s upload timeout plus Cloudflare finalization and app/database
 * clock skew — because the only deletions it defers are of rows whose screenshot
 * actually `404`s within minutes of creation (the rare unconfirmed-reclaim case
 * that persisted a reserved delivery URL): a normally uploaded image returns
 * `ok` on delete and is removed immediately. Once the window elapses the create
 * has certainly resolved, so a `404` is then trusted as a confirmed clear and
 * the row can never become permanently undeletable.
 */
export const SITEPING_SCREENSHOT_UPLOAD_RACE_WINDOW_MS = 300_000;
