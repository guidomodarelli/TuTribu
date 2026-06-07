import { PostgresMessageVideoThumbnailRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-video-thumbnail-repository";

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

describe("PostgresMessageVideoThumbnailRepository", () => {
  it("lists unresolved, non-youtube videos for the given messages", async () => {
    const execute = jest.fn().mockResolvedValue({
      rows: [
        {
          external_video_id: "123456789",
          external_video_provider: "vimeo",
          id: "video-1",
        },
        {
          external_video_id: null,
          external_video_provider: "vimeo",
          id: "video-broken",
        },
      ],
    });
    const repository = new PostgresMessageVideoThumbnailRepository(
      async (callback) => callback({ execute } as never)
    );

    await expect(
      repository.listUnresolvedVideos({ messageIds: ["message-1"] })
    ).resolves.toEqual([
      { externalId: "123456789", id: "video-1", provider: "vimeo" },
    ]);

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("from public.message_videos");
    expect(sqlText).toContain("message_videos.thumbnail_url is null");
    expect(sqlText).toContain("message_videos.thumbnail_resolved_at is null");
    expect(sqlText).toContain("message_videos.external_video_provider <>");
  });

  it("returns an empty list without querying when there are no message ids", async () => {
    const execute = jest.fn();
    const repository = new PostgresMessageVideoThumbnailRepository(
      async (callback) => callback({ execute } as never)
    );

    await expect(
      repository.listUnresolvedVideos({ messageIds: [] })
    ).resolves.toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("persists a thumbnail through the security definer function", async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ rows: [{ persisted: true }] });
    const repository = new PostgresMessageVideoThumbnailRepository(
      async (callback) => callback({ execute } as never)
    );

    await expect(
      repository.persistThumbnail({
        thumbnailUrl: "https://thumb.example/vimeo.jpg",
        videoId: "video-1",
      })
    ).resolves.toBe(true);

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("public.set_message_video_thumbnail");
  });

  it("reports a non-persisted attempt when the function updates no row", async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ rows: [{ persisted: false }] });
    const repository = new PostgresMessageVideoThumbnailRepository(
      async (callback) => callback({ execute } as never)
    );

    await expect(
      repository.persistThumbnail({ thumbnailUrl: null, videoId: "video-1" })
    ).resolves.toBe(false);
  });
});
