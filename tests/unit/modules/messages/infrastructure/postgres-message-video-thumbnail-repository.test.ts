import { vi, describe, it, expect } from "vitest";
import { MESSAGE_VIDEO_THUMBNAIL_BACKFILL } from "@/src/modules/messages/constants/message-round";
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

function getNumericSqlParams(statement: unknown): number[] {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .flatMap((chunk) => {
      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        typeof (chunk as { value: unknown }).value === "number"
      ) {
        return [(chunk as { value: number }).value];
      }

      return [];
    });
}

describe("PostgresMessageVideoThumbnailRepository", () => {
  it("lists unresolved, non-youtube videos for the given messages", async () => {
    const execute = vi.fn().mockResolvedValue({
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
    expect(sqlText).toContain("message_videos.thumbnail_last_attempt_at is null");
    expect(sqlText).toContain("make_interval(mins =>");
  });

  it("returns an empty list without querying when there are no message ids", async () => {
    const execute = vi.fn();
    const repository = new PostgresMessageVideoThumbnailRepository(
      async (callback) => callback({ execute } as never)
    );

    await expect(
      repository.listUnresolvedVideos({ messageIds: [] })
    ).resolves.toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("persists a thumbnail through the security definer function", async () => {
    const execute = vi
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
    const numericParams = getNumericSqlParams(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("public.set_message_video_thumbnail");
    expect(numericParams).toContain(MESSAGE_VIDEO_THUMBNAIL_BACKFILL.maxAttempts);
    expect(numericParams).toContain(
      MESSAGE_VIDEO_THUMBNAIL_BACKFILL.retryCooldownMinutes
    );
  });

  it("reports a non-persisted attempt when the function updates no row", async () => {
    const execute = vi
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
