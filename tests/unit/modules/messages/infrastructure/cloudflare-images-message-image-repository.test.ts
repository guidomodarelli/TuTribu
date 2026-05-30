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

  it("keeps the image pending delete when remote deletion fails", async () => {
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
          },
        ],
      })
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

    expect(execute).toHaveBeenCalledTimes(2);
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("pending_delete");
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
