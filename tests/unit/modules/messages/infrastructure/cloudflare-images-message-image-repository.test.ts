import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));

import { CloudflareImagesMessageImageRepository } from "@/src/modules/messages/infrastructure/repositories/cloudflare-images-message-image-repository";

const MESSAGE_IMAGE_LOG_RESULT = {
  failed: "failed",
} as const;

const HTTP_STATUS = {
  notFound: 404,
} as const;

function configureCloudflareImagesEnvironment() {
  process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH = "account-hash";
  process.env.CLOUDFLARE_ACCOUNT_ID = "account-id";
  process.env.CLOUDFLARE_IMAGES_API_TOKEN = "api-token";
  process.env.CLOUDFLARE_IMAGES_DELIVERY_VARIANT = "public";
}

function clearCloudflareImagesEnvironment() {
  delete process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_IMAGES_API_TOKEN;
  delete process.env.CLOUDFLARE_IMAGES_DELIVERY_VARIANT;
}

describe("CloudflareImagesMessageImageRepository", () => {
  beforeEach(() => {
    configureCloudflareImagesEnvironment();
  });

  afterEach(() => {
    clearCloudflareImagesEnvironment();
    vi.restoreAllMocks();
  });

  it("creates a Direct Creator Upload and stores the draft asset", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return createFetchResponse({
        result: {
          id: "cloudflare-image-1",
          uploadURL: "https://upload.imagedelivery.net/direct-upload",
        },
        success: true,
      }); }
    );
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ can_write: true, tribe_id: "tribe-1" }],
      })
      .mockResolvedValueOnce({ rows: [{ asset_id: "asset-1" }] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher }
    );

    await expect(
      repository.createUpload({
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({
      assetId: "asset-1",
      imageId: "cloudflare-image-1",
      status: "created" as const,
      uploadUrl: "https://upload.imagedelivery.net/direct-upload",
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];

    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v2/direct_upload"
    );
    expect(init).toMatchObject({
      headers: { Authorization: "Bearer api-token" },
      method: "POST",
    });
    expect(((init as RequestInit | undefined)?.body as FormData).get("requireSignedURLs")).toBe("false");
  });

  it("deletes the remote asset when storing the draft asset fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          result: {
            id: "cloudflare-image-1",
            uploadURL: "https://upload.imagedelivery.net/direct-upload",
          },
          success: true,
        })
      )
      .mockResolvedValueOnce(createFetchResponse({}));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ can_write: true, tribe_id: "tribe-1" }],
      })
      .mockRejectedValueOnce(new Error("insert failed"));
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher }
    );

    await expect(
      repository.createUpload({
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).rejects.toThrow("insert failed");

    expect(fetcher).toHaveBeenLastCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/cloudflare-image-1",
      expect.objectContaining({
        headers: { Authorization: "Bearer api-token" },
        method: "DELETE",
      })
    );
  });

  it("verifies draft assets are uploaded before attachment", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return createFetchResponse({
        result: { draft: false, id: "cloudflare-image-1" },
        success: true,
      }); }
    );
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          cloudflare_image_id: "cloudflare-image-1",
          id: "asset-1",
          message_id: null,
          status: "draft" as const,
        },
      ],
    }); });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher }
    );

    await expect(
      repository.prepareForAttachment({
        images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({
      images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
      status: "ready" as const,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/cloudflare-image-1",
      expect.objectContaining({
        headers: { Authorization: "Bearer api-token" },
        method: "GET",
      })
    );
  });

  it("treats uploaded Cloudflare assets without a draft flag as ready", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return createFetchResponse({
        result: {
          id: "cloudflare-image-1",
          uploaded: "2026-05-31T00:42:02.249Z",
        },
        success: true,
      }); }
    );
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          cloudflare_image_id: "cloudflare-image-1",
          id: "asset-1",
          message_id: null,
          status: "draft" as const,
        },
      ],
    }); });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher }
    );

    await expect(
      repository.prepareForAttachment({
        images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({
      images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
      status: "ready" as const,
    });
  });

  it("waits for a recently uploaded draft asset before attachment", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          result: { draft: true, id: "cloudflare-image-1" },
          success: true,
        })
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          result: { draft: false, id: "cloudflare-image-1" },
          success: true,
        })
      );
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          cloudflare_image_id: "cloudflare-image-1",
          id: "asset-1",
          message_id: null,
          status: "draft" as const,
        },
      ],
    }); });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher, imageReadinessRetry: { delayMs: 0, maxAttempts: 2 } }
    );

    await expect(
      repository.prepareForAttachment({
        images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({
      images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
      status: "ready" as const,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("marks an allowed asset for deletion and deletes it remotely", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return createFetchResponse({}); });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_delete: true,
            cloudflare_image_id: "cloudflare-image-1",
            id: "asset-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ asset_id: "asset-1" }] })
      .mockResolvedValueOnce({ rows: [{ asset_id: "asset-1" }] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher }
    );

    await expect(
      repository.deleteImage({
        assetId: "asset-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "deleted" as const });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/cloudflare-image-1",
      expect.objectContaining({
        headers: { Authorization: "Bearer api-token" },
        method: "DELETE",
      })
    );
  });

  it("does not delete remotely when the local pending delete mark is not persisted", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return createFetchResponse({}); });
    const logger = { warn: vi.fn() };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_delete: true,
            cloudflare_image_id: "cloudflare-image-1",
            id: "asset-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher, logger }
    );

    await expect(
      repository.deleteImage({
        assetId: "asset-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "invalid_image" as const });

    expect(fetcher).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({
      message: "Message image local pending delete mark failed",
      metadata: {
        assetId: "asset-1",
        result: MESSAGE_IMAGE_LOG_RESULT.failed,
        tribeSlug: "matematica-pro",
      },
    });
  });

  it("keeps deletion pending when the final local delete mark is not persisted", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return createFetchResponse({}); });
    const logger = { warn: vi.fn() };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_delete: true,
            cloudflare_image_id: "cloudflare-image-1",
            id: "asset-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ asset_id: "asset-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher, logger }
    );

    await expect(
      repository.deleteImage({
        assetId: "asset-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "invalid_image" as const });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({
      message: "Message image local delete mark failed",
      metadata: {
        assetId: "asset-1",
        result: MESSAGE_IMAGE_LOG_RESULT.failed,
        tribeSlug: "matematica-pro",
      },
    });
  });

  it("restores the local image state when remote deletion fails", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return ({
      json: async () => ({}),
      ok: false,
    }) as Response; });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_delete: true,
            cloudflare_image_id: "cloudflare-image-1",
            id: "asset-1",
            sort_order: 2,
            status: "attached" as const,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ asset_id: "asset-1" }] })
      .mockResolvedValueOnce({ rows: [{ asset_id: "asset-1" }] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher }
    );

    await expect(
      repository.deleteImage({
        assetId: "asset-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "invalid_image" as const });

  });

  it("does not restore a row a concurrent sweep already finalized when remote deletion fails", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return ({
      json: async () => ({}),
      ok: false,
    }) as Response; });
    const logger = { warn: vi.fn() };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_delete: true,
            cloudflare_image_id: "cloudflare-image-1",
            id: "asset-1",
            sort_order: 2,
            status: "attached" as const,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ asset_id: "asset-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher, logger }
    );

    await expect(
      repository.deleteImage({
        assetId: "asset-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "invalid_image" as const });

    expect(logger.warn).toHaveBeenCalledWith({
      message: "Message image local delete rollback failed",
      metadata: {
        assetId: "asset-1",
        result: MESSAGE_IMAGE_LOG_RESULT.failed,
        tribeSlug: "matematica-pro",
      },
    });
  });

  it("keeps pending image cleanup best effort when remote deletion rejects", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args;
      throw new Error("Cloudflare timeout");
    });
    const logger = { warn: vi.fn() };
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          can_delete: true,
          cloudflare_image_id: "cloudflare-image-1",
          id: "asset-1",
        },
      ],
    });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher, logger }
    );

    await expect(
      repository.deletePendingImages({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith({
      message: "Message image remote delete failed",
      metadata: {
        assetId: "asset-1",
        result: MESSAGE_IMAGE_LOG_RESULT.failed,
        tribeSlug: "matematica-pro",
      },
    });
  });

  it("marks a pending image deleted when the remote asset is already gone", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return ({
      json: async () => ({}),
      ok: false,
      status: HTTP_STATUS.notFound,
    }) as Response; });
    const logger = { warn: vi.fn() };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_delete: true,
            cloudflare_image_id: "cloudflare-image-1",
            id: "asset-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ asset_id: "asset-1" }] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher, logger }
    );

    await expect(
      repository.deletePendingImages({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toBeUndefined();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("sweeps pending images and the orphan queue, deleting each remote asset", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return createFetchResponse({}); });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ reclaimed: 2 }] })
      .mockResolvedValueOnce({
        rows: [{ asset_id: "asset-1", cloudflare_image_id: "cf-pending-1" }],
      })
      .mockResolvedValueOnce({ rows: [{ result: true }] })
      .mockResolvedValueOnce({
        rows: [{ cloudflare_image_id: "cf-queued-1", queue_id: "queue-1" }],
      })
      .mockResolvedValueOnce({ rows: [{ result: true }] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher }
    );

    await expect(
      repository.cleanupOrphanImages({
        abandonedDraftTtlHours: 24,
        batchLimit: 100,
        interactiveDeleteGraceMinutes: 15,
      })
    ).resolves.toEqual({
      reclaimedDrafts: 2,
      remoteDeletedPending: 1,
      remoteDeletedQueued: 1,
      remoteFailures: 0,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/cf-pending-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/cf-queued-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("keeps a pending asset for the next sweep when its remote deletion fails", async () => {
    const fetcher = vi.fn(async (...args: unknown[]) => { void args; return ({
      json: async () => ({}),
      ok: false,
    }) as Response; });
    const logger = { warn: vi.fn() };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ reclaimed: 0 }] })
      .mockResolvedValueOnce({
        rows: [{ asset_id: "asset-1", cloudflare_image_id: "cf-pending-1" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher, logger }
    );

    await expect(
      repository.cleanupOrphanImages({
        abandonedDraftTtlHours: 24,
        batchLimit: 100,
        interactiveDeleteGraceMinutes: 15,
      })
    ).resolves.toEqual({
      reclaimedDrafts: 0,
      remoteDeletedPending: 0,
      remoteDeletedQueued: 0,
      remoteFailures: 1,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({
      message: "Message image remote cleanup failed",
      metadata: {
        assetId: "asset-1",
        result: MESSAGE_IMAGE_LOG_RESULT.failed,
      },
    });
  });

  it("does nothing when Cloudflare Images is not configured", async () => {
    clearCloudflareImagesEnvironment();
    const fetcher = vi.fn();
    const execute = vi.fn();
    const repository = new CloudflareImagesMessageImageRepository(
      async (callback) => callback({ execute } as never),
      { fetcher }
    );

    await expect(
      repository.cleanupOrphanImages({
        abandonedDraftTtlHours: 24,
        batchLimit: 100,
        interactiveDeleteGraceMinutes: 15,
      })
    ).resolves.toEqual({
      reclaimedDrafts: 0,
      remoteDeletedPending: 0,
      remoteDeletedQueued: 0,
      remoteFailures: 0,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function createFetchResponse(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  } as Response;
}

