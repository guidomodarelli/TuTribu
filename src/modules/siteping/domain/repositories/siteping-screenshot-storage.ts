export type StoreSitepingScreenshotCommand = {
  /** Base64 image `data:` URL captured by the widget (e.g. `data:image/jpeg;base64,...`). */
  dataUrl: string;
};

/**
 * Port for persisting a SitePing screenshot to durable object storage and
 * returning a public URL to render. Implementations return `null` when storage
 * is not configured or the upload fails, so the caller persists no screenshot
 * instead of inlining the multi-MB data URL into the feedback row.
 */
export interface SitepingScreenshotStorage {
  store(command: StoreSitepingScreenshotCommand): Promise<string | null>;
}
