jest.mock("server-only", () => ({}));

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
    jest.restoreAllMocks();
  });

  it("creates a Direct Creator Upload and stores the draft asset", async () => {
    const fetcher = jest.fn(async () =>
      createFetchResponse({
        result: {
          id: "cloudflare-image-1",
          uploadURL: "https://upload.imagedelivery.net/direct-upload",
        },
        success: true,
      })
    );
    const execute = jest
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
      status: "created",
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
    expect((init?.body as FormData).get("requireSignedURLs")).toBe("false");
    expect(String(getSqlQuery(execute.mock.calls[1]?.[0]).params)).toContain(
      "https://imagedelivery.net/account-hash/cloudflare-image-1/public"
    );
  });

  it("deletes the remote asset when storing the draft asset fails", async () => {
    const fetcher = jest
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
    const execute = jest
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
    const fetcher = jest.fn(async () =>
      createFetchResponse({
        result: { draft: false, id: "cloudflare-image-1" },
        success: true,
      })
    );
    const execute = jest.fn(async () => ({
      rows: [
        {
          cloudflare_image_id: "cloudflare-image-1",
          id: "asset-1",
          message_id: null,
          status: "draft",
        },
      ],
    }));
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
      status: "ready",
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
    const fetcher = jest.fn(async () =>
      createFetchResponse({
        result: {
          id: "cloudflare-image-1",
          uploaded: "2026-05-31T00:42:02.249Z",
        },
        success: true,
      })
    );
    const execute = jest.fn(async () => ({
      rows: [
        {
          cloudflare_image_id: "cloudflare-image-1",
          id: "asset-1",
          message_id: null,
          status: "draft",
        },
      ],
    }));
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
      status: "ready",
    });
  });

  it("waits for a recently uploaded draft asset before attachment", async () => {
    const fetcher = jest
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
    const execute = jest.fn(async () => ({
      rows: [
        {
          cloudflare_image_id: "cloudflare-image-1",
          id: "asset-1",
          message_id: null,
          status: "draft",
        },
      ],
    }));
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
      status: "ready",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("marks an allowed asset for deletion and deletes it remotely", async () => {
    const fetcher = jest.fn(async () => createFetchResponse({}));
    const execute = jest
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
    ).resolves.toEqual({ status: "deleted" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/cloudflare-image-1",
      expect.objectContaining({
        headers: { Authorization: "Bearer api-token" },
        method: "DELETE",
      })
    );
    expect(execute).toHaveBeenCalledTimes(3);
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("pending_delete");
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain("deleted");
  });

  it("does not delete remotely when the local pending delete mark is not persisted", async () => {
    const fetcher = jest.fn(async () => createFetchResponse({}));
    const logger = { warn: jest.fn() };
    const execute = jest
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
    ).resolves.toEqual({ status: "invalid_image" });

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
    const fetcher = jest.fn(async () => createFetchResponse({}));
    const logger = { warn: jest.fn() };
    const execute = jest
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
    ).resolves.toEqual({ status: "invalid_image" });

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
    const fetcher = jest.fn(async () => ({
      json: async () => ({}),
      ok: false,
    }) as Response);
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_delete: true,
            cloudflare_image_id: "cloudflare-image-1",
            id: "asset-1",
            sort_order: 2,
            status: "attached",
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
    ).resolves.toEqual({ status: "invalid_image" });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("pending_delete");
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain("sort_order");
    expect(getSqlQuery(execute.mock.calls[2]?.[0]).params).toEqual(
      expect.arrayContaining(["attached", 2, "pending_delete"])
    );
  });

  it("does not restore a row a concurrent sweep already finalized when remote deletion fails", async () => {
    const fetcher = jest.fn(async () => ({
      json: async () => ({}),
      ok: false,
    }) as Response);
    const logger = { warn: jest.fn() };
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_delete: true,
            cloudflare_image_id: "cloudflare-image-1",
            id: "asset-1",
            sort_order: 2,
            status: "attached",
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
    ).resolves.toEqual({ status: "invalid_image" });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(getSqlQuery(execute.mock.calls[2]?.[0]).params).toEqual(
      expect.arrayContaining(["pending_delete"])
    );
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
    const fetcher = jest.fn(async () => {
      throw new Error("Cloudflare timeout");
    });
    const logger = { warn: jest.fn() };
    const execute = jest.fn().mockResolvedValueOnce({
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

    expect(execute).toHaveBeenCalledTimes(1);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "message_images.uploaded_by"
    );
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "deleted_message_id"
    );
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
    const fetcher = jest.fn(async () => ({
      json: async () => ({}),
      ok: false,
      status: HTTP_STATUS.notFound,
    }) as Response);
    const logger = { warn: jest.fn() };
    const execute = jest
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

    expect(execute).toHaveBeenCalledTimes(2);
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("deleted");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("sweeps pending images and the orphan queue, deleting each remote asset", async () => {
    const fetcher = jest.fn(async () => createFetchResponse({}));
    const execute = jest
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

    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("make_interval");
    expect(getSqlQuery(execute.mock.calls[1]?.[0]).params).toEqual(
      expect.arrayContaining([15])
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/cf-pending-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/images/v1/cf-queued-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "reclaim_abandoned_draft_message_images"
    );
    expect(getSqlQuery(execute.mock.calls[0]?.[0]).params).toEqual(
      expect.arrayContaining([24, 100])
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "list_message_images_pending_remote_deletion"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "confirm_message_image_remote_deleted"
    );
    expect(getSqlText(execute.mock.calls[3]?.[0])).toContain(
      "list_queued_remote_image_deletions"
    );
    expect(getSqlText(execute.mock.calls[4]?.[0])).toContain(
      "delete_queued_remote_image_deletion"
    );
  });

  it("keeps a pending asset for the next sweep when its remote deletion fails", async () => {
    const fetcher = jest.fn(async () => ({
      json: async () => ({}),
      ok: false,
    }) as Response);
    const logger = { warn: jest.fn() };
    const execute = jest
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
    expect(execute).toHaveBeenCalledTimes(3);
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
    const fetcher = jest.fn();
    const execute = jest.fn();
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

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

function getSqlQuery(statement: unknown): { params: unknown[]; sql: string } {
  return (
    statement as {
      toQuery: (config: {
        casing: { getColumnCasing: (column: { name: string }) => string };
        escapeName: (name: string) => string;
        escapeParam: (index: number) => string;
        escapeString: (value: string) => string;
      }) => { params: unknown[]; sql: string };
    }
  ).toQuery({
    casing: { getColumnCasing: (column) => column.name },
    escapeName: (name) => `"${name}"`,
    escapeParam: (index) => `$${index + 1}`,
    escapeString: (value) => `'${value.replaceAll("'", "''")}'`,
  });
}
