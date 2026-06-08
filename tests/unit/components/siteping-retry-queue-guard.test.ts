import {
  SITEPING_RETRY_QUEUE_STORAGE_KEY,
  installSitepingRetryQueueGuard,
  stripScreenshotsFromRetryQueue,
} from "@/components/providers/siteping-provider/siteping-retry-queue-guard";

/** Builds a base64 image data URL of roughly `sizeInChars` characters. */
function buildScreenshotDataUrl(sizeInChars: number): string {
  const prefix = "data:image/jpeg;base64,";
  return prefix + "A".repeat(Math.max(0, sizeInChars - prefix.length));
}

/** Builds a retry-queue entry shaped like the one `@siteping/widget` persists. */
function buildQueueEntry(screenshotDataUrl: string | null) {
  return {
    endpoint: "/api/siteping",
    payload: {
      annotations: [],
      authorEmail: "leader@example.com",
      authorName: "Leader Example",
      clientId: "client-1",
      message: "Algo no funciona",
      projectName: "tutribu",
      screenshotDataUrl,
      type: "bug",
      url: "/tribus/demo",
      userAgent: "test-agent",
      viewport: "1440x778",
    },
  };
}

describe("stripScreenshotsFromRetryQueue", () => {
  it("drops the screenshot data URL from every queued payload", () => {
    const serialized = JSON.stringify([
      buildQueueEntry(buildScreenshotDataUrl(2_000_000)),
      buildQueueEntry(buildScreenshotDataUrl(3_000_000)),
    ]);

    const result = JSON.parse(stripScreenshotsFromRetryQueue(serialized));

    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.payload.screenshotDataUrl).toBeNull();
    }
  });

  it("keeps every non-screenshot field of the queued payload intact", () => {
    const original = buildQueueEntry(buildScreenshotDataUrl(2_000_000));
    const serialized = JSON.stringify([original]);

    const [entry] = JSON.parse(stripScreenshotsFromRetryQueue(serialized));

    expect(entry.endpoint).toBe(original.endpoint);
    expect(entry.payload).toEqual({
      ...original.payload,
      screenshotDataUrl: null,
    });
  });

  it("collapses a multi-MB queue to a small quota-safe payload", () => {
    const serialized = JSON.stringify([
      buildQueueEntry(buildScreenshotDataUrl(4_000_000)),
    ]);
    expect(serialized.length).toBeGreaterThan(2_000_000);

    const result = stripScreenshotsFromRetryQueue(serialized);

    expect(result.length).toBeLessThan(2_000);
  });

  it("leaves entries without a screenshot untouched", () => {
    const serialized = JSON.stringify([buildQueueEntry(null)]);

    expect(stripScreenshotsFromRetryQueue(serialized)).toBe(serialized);
  });

  it("returns the input unchanged when it is not valid JSON", () => {
    expect(stripScreenshotsFromRetryQueue("not-json")).toBe("not-json");
  });

  it("returns the input unchanged when the value is not an array", () => {
    const serialized = JSON.stringify({ unexpected: true });

    expect(stripScreenshotsFromRetryQueue(serialized)).toBe(serialized);
  });
});

describe("installSitepingRetryQueueGuard", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("strips screenshots from a retry-queue write the widget makes through setItem", () => {
    const restore = installSitepingRetryQueueGuard();

    try {
      const widgetWrite = JSON.stringify([
        buildQueueEntry(buildScreenshotDataUrl(4_000_000)),
      ]);
      window.localStorage.setItem(SITEPING_RETRY_QUEUE_STORAGE_KEY, widgetWrite);

      const persisted = window.localStorage.getItem(
        SITEPING_RETRY_QUEUE_STORAGE_KEY
      );
      expect(persisted).not.toBeNull();
      const stored = JSON.parse(persisted as string);
      expect(stored[0].payload.screenshotDataUrl).toBeNull();
      expect((persisted as string).length).toBeLessThan(2_000);
    } finally {
      restore();
    }
  });

  it("does not alter writes to other storage keys", () => {
    const restore = installSitepingRetryQueueGuard();

    try {
      const otherValue = JSON.stringify([
        buildQueueEntry(buildScreenshotDataUrl(1_000)),
      ]);
      window.localStorage.setItem("unrelated_key", otherValue);

      expect(window.localStorage.getItem("unrelated_key")).toBe(otherValue);
    } finally {
      restore();
    }
  });

  it("sanitizes a queue already persisted before the guard installs", () => {
    // The widget could have stored a moderate screenshot before the guard ran.
    const preExisting = JSON.stringify([
      buildQueueEntry(buildScreenshotDataUrl(1_000_000)),
    ]);
    window.localStorage.setItem(SITEPING_RETRY_QUEUE_STORAGE_KEY, preExisting);

    const restore = installSitepingRetryQueueGuard();

    try {
      const stored = JSON.parse(
        window.localStorage.getItem(SITEPING_RETRY_QUEUE_STORAGE_KEY) as string
      );
      expect(stored[0].payload.screenshotDataUrl).toBeNull();
    } finally {
      restore();
    }
  });

  it("restores the original setItem on cleanup", () => {
    const originalSetItem = window.localStorage.setItem;

    const restore = installSitepingRetryQueueGuard();
    restore();

    expect(window.localStorage.setItem).toBe(originalSetItem);

    // After cleanup, a retry-queue write is no longer sanitized.
    const widgetWrite = JSON.stringify([
      buildQueueEntry(buildScreenshotDataUrl(1_000)),
    ]);
    window.localStorage.setItem(SITEPING_RETRY_QUEUE_STORAGE_KEY, widgetWrite);
    expect(
      window.localStorage.getItem(SITEPING_RETRY_QUEUE_STORAGE_KEY)
    ).toBe(widgetWrite);
  });
});
