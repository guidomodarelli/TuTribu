export type StoreSitepingScreenshotCommand = {
  /** Base64 image `data:` URL captured by the widget (e.g. `data:image/jpeg;base64,...`). */
  dataUrl: string;
};

export type DeleteSitepingScreenshotCommand = {
  /** Stored value of `screenshot_url`: either a durable public URL or an inline `data:` URL fallback. */
  screenshotUrl: string;
  /**
   * Whether a `DELETE` `404` may be trusted as "already gone" and thus a
   * confirmed clear. Defaults to `true` (omit it) once the screenshot's upload
   * can no longer be in flight: a `404` then means the image is genuinely
   * absent. Pass `false` while the original non-idempotent upload could still be
   * racing — a reserved delivery URL persisted by an unconfirmed reclaim, deleted
   * within the upload race window — because a `404` may only mean the create has
   * not landed yet, and trusting it would let the caller remove the only row
   * referencing the soon-to-exist public image and strand an orphan.
   */
  treatNotFoundAsCleared?: boolean;
};

export type DeleteSitepingScreenshotResult = {
  /**
   * `true` when the durable screenshot is confirmed gone — deleted now, already
   * absent (`404`), or never a remote image we own (an inline `data:` fallback
   * or a URL from another account) — so the caller may safely remove the
   * feedback row. `false` when the remote image may still exist (storage
   * unconfigured, an auth/`4xx`/`5xx` response, or a timeout/network error), so
   * the caller must keep the row to let a later deletion retry reclaim the
   * orphan.
   */
  screenshotCleared: boolean;
};

/**
 * Port for persisting a SitePing screenshot to durable object storage and
 * returning a public URL to render. Implementations return `null` when storage
 * is not configured or the upload fails, so the caller persists no screenshot
 * instead of inlining the multi-MB data URL into the feedback row.
 */
export interface SitepingScreenshotStorage {
  store(command: StoreSitepingScreenshotCommand): Promise<string | null>;
  /**
   * Deletes the durable screenshot backing `screenshotUrl` so deleting feedback
   * does not leave an orphaned public image. Resolves without throwing and
   * reports whether the screenshot is confirmed cleared through
   * {@link DeleteSitepingScreenshotResult.screenshotCleared}: the caller must
   * only remove the feedback row once deletion is confirmed, and otherwise keep
   * the row so a later retry can reclaim the orphan.
   */
  delete(
    command: DeleteSitepingScreenshotCommand
  ): Promise<DeleteSitepingScreenshotResult>;
}
