import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ComposerMediaDraft,
  releaseUnreferencedImagePreviewUrls,
} from "@/components/tribe-round/tribe-round/tribe-round-shared";
import type { TribeRoundMessageResult } from "@/src/modules/messages/application/results/tribe-round-result";

const PREVIEW_URL = "blob:message-image";
const SERVER_URL = "https://imagedelivery.net/account-hash/image-1/public";

/** A message whose only image points at the given URL; the rest of the shape is irrelevant here. */
function messageShowing(url: string): TribeRoundMessageResult {
  return {
    media: [{ altText: "", id: "asset-1", kind: "image", sortOrder: 0, url }],
  } as unknown as TribeRoundMessageResult;
}

describe("releaseUnreferencedImagePreviewUrls", () => {
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
  });

  function mockRevoke() {
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    return revokeObjectUrl;
  }

  it("keeps a preview that a message still shows", () => {
    const revokeObjectUrl = mockRevoke();
    const retainedPreviewUrls = new Set([PREVIEW_URL]);

    releaseUnreferencedImagePreviewUrls({ mediaDrafts: [], messages: [messageShowing(PREVIEW_URL)], retainedPreviewUrls });

    expect(revokeObjectUrl).not.toHaveBeenCalled();
    expect(retainedPreviewUrls).toEqual(new Set([PREVIEW_URL]));
  });

  it("keeps a preview that an edit draft still shows", () => {
    const revokeObjectUrl = mockRevoke();
    const retainedPreviewUrls = new Set([PREVIEW_URL]);
    const mediaDrafts = [
      { altText: "", assetId: "asset-1", isPersisted: true, kind: "image", localId: "asset-1", previewUrl: PREVIEW_URL, status: "uploaded" },
    ] as ComposerMediaDraft[];

    releaseUnreferencedImagePreviewUrls({ mediaDrafts, messages: [messageShowing(SERVER_URL)], retainedPreviewUrls });

    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("revokes and forgets a preview once the server image replaced it", () => {
    const revokeObjectUrl = mockRevoke();
    const retainedPreviewUrls = new Set([PREVIEW_URL]);

    releaseUnreferencedImagePreviewUrls({ mediaDrafts: [], messages: [messageShowing(SERVER_URL)], retainedPreviewUrls });

    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(PREVIEW_URL);
    expect(retainedPreviewUrls.size).toBe(0);
  });
});
