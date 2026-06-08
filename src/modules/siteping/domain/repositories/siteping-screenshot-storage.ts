export type StoreSitepingScreenshotCommand = {
  /** Base64 image `data:` URL captured by the widget (e.g. `data:image/jpeg;base64,...`). */
  dataUrl: string;
};

export type DeleteSitepingScreenshotCommand = {
  /** Stored value of `screenshot_url`: either a durable public URL or an inline `data:` URL fallback. */
  screenshotUrl: string;
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
   * does not leave an orphaned public image. Resolves without throwing when
   * storage is unconfigured, the URL is an inline `data:` fallback, the remote
   * image is already gone, or the remote delete fails, so it never blocks the
   * feedback deletion flow.
   */
  delete(command: DeleteSitepingScreenshotCommand): Promise<void>;
}
