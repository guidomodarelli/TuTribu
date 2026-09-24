import { describe, expect, it, vi, type Mock } from "vitest";

import { PostgresTribeEventOccurrenceCommentRepository } from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-occurrence-comment-repository";
import { PostgresTribeEventPostEventRepository } from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-post-event-repository";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const COMMENT_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const TRIBE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TRIBE_SLUG = "matematica-pro";
const ORIGINAL_STARTS_AT = "2026-05-14T21:00:00.000Z";
const key = { eventId: EVENT_ID, originalStartsAt: ORIGINAL_STARTS_AT, tribeSlug: TRIBE_SLUG };

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (chunk && typeof chunk === "object" && "value" in chunk) {
        const value = (chunk as { value: unknown }).value;

        return Array.isArray(value) ? value.join("") : "";
      }

      if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
        return getSqlText(chunk);
      }

      return "";
    })
    .join("");
}

/**
 * Runs the repository against a fake request transaction whose `execute`
 * answers each statement in order.
 */
function createExecutor(execute: Mock) {
  return async <T,>(callback: (database: never) => Promise<T>) =>
    callback({ execute } as never);
}

const resourcesRow = {
  can_manage: true,
  can_participate: true,
  external_video_id: "dQw4w9WgXcQ",
  materials: [
    { title: "Slides", url: "https://example.com/slides" },
    { title: 42, url: "https://example.com/broken" },
  ],
  reaction_counts: { fire: "2", thumbs_up: 1, unknown: 9 },
  source_url: "https://youtu.be/dQw4w9WgXcQ",
  video_provider: "youtube",
  viewer_reaction: "fire",
};

describe("PostgresTribeEventPostEventRepository", () => {
  it("maps the resources and guards the read with the tribe read access", async () => {
    const execute = vi.fn<(statement: unknown) => Promise<{ rows: unknown[] }>>(async () => ({
      rows: [resourcesRow],
    }));
    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));

    await expect(repository.getResources(key)).resolves.toEqual({
      materials: [{ title: "Slides", url: "https://example.com/slides" }],
      reactions: { counts: { fire: 2, neutral: 0, thumbs_up: 1 }, viewerReaction: "fire" },
      recording: {
        externalVideoId: "dQw4w9WgXcQ",
        provider: "youtube",
        sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
      },
      viewerPermissions: { canManageResources: true, canParticipate: true },
    });
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain("public.can_read_tribe_content");
  });

  it("returns null when the event is not readable", async () => {
    const repository = new PostgresTribeEventPostEventRepository(
      createExecutor(vi.fn(async () => ({ rows: [] })))
    );

    await expect(repository.getResources(key)).resolves.toBeNull();
  });

  it("refuses to save for viewers who do not manage events, before locking", async () => {
    const execute = vi.fn(async () => ({ rows: [{ can_manage: false, tribe_id: TRIBE_ID }] }));
    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));

    await expect(
      repository.saveResources({ ...key, materials: [], recording: null })
    ).resolves.toEqual({ status: "forbidden" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("serializes a save with an advisory lock and rereads the fresh resources", async () => {
    // The target check answers the tribe; the final reread answers the
    // resources; the writes in between return no rows.
    const execute = vi.fn(async (statement: unknown) =>
      getSqlText(statement).includes("with target_event")
        ? { rows: [resourcesRow] }
        : { rows: [{ can_manage: true, tribe_id: TRIBE_ID }] }
    );

    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));
    const result = await repository.saveResources({
      ...key,
      materials: [{ title: "Slides", url: "https://example.com/slides" }],
      recording: {
        externalVideoId: "dQw4w9WgXcQ",
        provider: "youtube",
        sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
      },
    });
    const statements = execute.mock.calls.map(([statement]) => getSqlText(statement));

    expect(result.status).toBe("post_event_saved");
    expect(statements[1]).toContain("pg_advisory_xact_lock");
    expect(statements.some((statement) => statement.includes("on conflict (event_id, original_starts_at)"))).toBe(
      true
    );
    expect(statements.some((statement) => statement.includes("jsonb_to_recordset"))).toBe(true);
  });

  it("only lets active members react and answers not found outside the tribe", async () => {
    const forbidden = new PostgresTribeEventPostEventRepository(
      createExecutor(vi.fn(async () => ({ rows: [{ can_participate: false, tribe_id: TRIBE_ID }] })))
    );
    const missing = new PostgresTribeEventPostEventRepository(
      createExecutor(vi.fn(async () => ({ rows: [] })))
    );

    await expect(forbidden.setReaction({ ...key, reaction: "fire" })).resolves.toEqual({
      status: "forbidden",
    });
    await expect(missing.setReaction({ ...key, reaction: "fire" })).resolves.toEqual({
      status: "not_found",
    });
  });
});

describe("PostgresTribeEventOccurrenceCommentRepository", () => {
  it("maps the conversation and whether the viewer can write", async () => {
    const repository = new PostgresTribeEventOccurrenceCommentRepository(
      createExecutor(
        vi.fn(async () => ({
          rows: [
            {
              can_comment: true,
              comments: [
                {
                  author_image_url: null,
                  author_name: "Ana",
                  can_delete: false,
                  content: "¿Suben las slides?",
                  created_at: "2026-05-14T23:00:00+00:00",
                  id: COMMENT_ID,
                },
              ],
            },
          ],
        }))
      )
    );

    await expect(repository.list(key)).resolves.toEqual({
      canComment: true,
      comments: [
        {
          authorImageUrl: null,
          authorName: "Ana",
          canDelete: false,
          content: "¿Suben las slides?",
          createdAt: "2026-05-14T23:00:00.000Z",
          id: COMMENT_ID,
        },
      ],
      status: "found",
    });
  });

  it("reports forbidden and not found writes from the SQL status", async () => {
    const forbidden = new PostgresTribeEventOccurrenceCommentRepository(
      createExecutor(vi.fn(async () => ({ rows: [{ status: "forbidden" }] })))
    );
    const missing = new PostgresTribeEventOccurrenceCommentRepository(
      createExecutor(vi.fn(async () => ({ rows: [{ status: "not_found" }] })))
    );

    await expect(forbidden.create({ ...key, content: "Hola" })).resolves.toEqual({
      status: "forbidden",
    });
    await expect(missing.delete({ commentId: COMMENT_ID, tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      status: "not_found",
    });
  });
});
