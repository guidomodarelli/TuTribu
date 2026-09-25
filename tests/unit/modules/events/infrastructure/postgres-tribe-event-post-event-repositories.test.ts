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

/**
 * Guard row of an open, finished slot the viewer manages and takes part in.
 */
const openGuard = {
  can_manage: true,
  can_participate: true,
  can_read: true,
  is_cancelled: false,
  is_finished: true,
  is_occurrence: true,
  tribe_id: TRIBE_ID,
};

type GuardRow = typeof openGuard | null;

/**
 * Fake transaction: each occurrence guard read answers the next row of
 * `guards` (the last one repeats); the resources read answers the resources;
 * every other statement (locks, writes) returns no rows.
 */
function createGuardedExecute(guards: GuardRow[]) {
  const statements: string[] = [];
  let guardReads = 0;
  const execute = vi.fn(async (statement: unknown) => {
    const text = getSqlText(statement);

    statements.push(text);

    if (text.includes("is_tribe_event_series_occurrence")) {
      const guard = guards[Math.min(guardReads, guards.length - 1)] ?? null;

      guardReads += 1;

      return { rows: guard ? [guard] : [] };
    }

    if (text.includes("with target_event")) {
      return { rows: [resourcesRow] };
    }

    if (text.includes("reaction_counts")) {
      return { rows: [{ reaction_counts: {}, viewer_reaction: null }] };
    }

    return { rows: [] };
  });

  return { execute, statements };
}

function hasResourceWrite(statements: string[]): boolean {
  return statements.some(
    (statement) =>
      statement.includes("insert into public.event_occurrence_recordings") ||
      statement.includes("delete from public.event_occurrence_recordings") ||
      statement.includes("insert into public.event_occurrence_materials") ||
      statement.includes("delete from public.event_occurrence_materials")
  );
}

function hasStatement(statements: string[], fragment: string): boolean {
  return statements.some((statement) => statement.includes(fragment));
}

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

  it("locks membership and the event row, reads the guard, then locks the occurrence", async () => {
    const { execute, statements } = createGuardedExecute([openGuard]);
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

    expect(result.status).toBe("post_event_saved");
    expect(statements[0]).toContain("for share of tribe_members");
    expect(statements[1]).toContain("for share of events");
    expect(statements[2]).toContain("is_tribe_event_series_occurrence");
    expect(statements[3]).toContain("pg_advisory_xact_lock");
    expect(hasStatement(statements, "on conflict (event_id, original_starts_at)")).toBe(true);
    expect(hasStatement(statements, "jsonb_to_recordset")).toBe(true);
  });

  it("refuses to save for viewers who do not manage events, before the occurrence lock", async () => {
    const { execute, statements } = createGuardedExecute([{ ...openGuard, can_manage: false }]);
    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));

    await expect(
      repository.saveResources({ ...key, materials: [], recording: null })
    ).resolves.toEqual({ status: "forbidden" });
    expect(hasStatement(statements, "pg_advisory_xact_lock")).toBe(false);
    expect(hasResourceWrite(statements)).toBe(false);
  });

  it.each([
    ["invalid_occurrence", { ...openGuard, is_occurrence: false }],
    ["occurrence_cancelled", { ...openGuard, is_cancelled: true }],
    ["occurrence_not_finished", { ...openGuard, is_finished: false }],
    ["not_found", null],
  ] as const)("revalidates the slot inside the save transaction (%s)", async (status, guard) => {
    const { execute, statements } = createGuardedExecute([guard]);
    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));

    await expect(
      repository.saveResources({ ...key, materials: [], recording: null })
    ).resolves.toEqual({ status });
    expect(hasResourceWrite(statements)).toBe(false);
  });

  it("revalidates the slot under the membership and event locks before reacting", async () => {
    const { execute, statements } = createGuardedExecute([{ ...openGuard, is_cancelled: true }]);
    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));

    await expect(repository.setReaction({ ...key, reaction: "fire" })).resolves.toEqual({
      status: "occurrence_cancelled",
    });
    expect(statements[0]).toContain("for share of tribe_members");
    expect(statements[1]).toContain("for share of events");
    expect(hasStatement(statements, "insert into public.event_occurrence_reactions")).toBe(false);
  });

  it("refuses a reaction on a date that has not finished yet", async () => {
    const { execute } = createGuardedExecute([{ ...openGuard, is_finished: false }]);
    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));

    await expect(repository.setReaction({ ...key, reaction: "fire" })).resolves.toEqual({
      status: "occurrence_not_finished",
    });
  });

  it("still lets a member take back a reaction on a cancelled date", async () => {
    const { execute, statements } = createGuardedExecute([
      { ...openGuard, is_cancelled: true, is_finished: false },
    ]);
    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));

    await expect(repository.setReaction({ ...key, reaction: null })).resolves.toMatchObject({
      status: "reaction_cleared",
    });
    expect(hasStatement(statements, "delete from public.event_occurrence_reactions")).toBe(true);
  });

  it("refuses a reaction on an instant that is no longer a slot", async () => {
    const { execute, statements } = createGuardedExecute([{ ...openGuard, is_occurrence: false }]);
    const repository = new PostgresTribeEventPostEventRepository(createExecutor(execute));

    await expect(repository.setReaction({ ...key, reaction: null })).resolves.toEqual({
      status: "invalid_occurrence",
    });
    expect(hasStatement(statements, "delete from public.event_occurrence_reactions")).toBe(false);
  });

  it("only lets active members react and answers not found outside the tribe", async () => {
    const forbidden = new PostgresTribeEventPostEventRepository(
      createExecutor(createGuardedExecute([{ ...openGuard, can_participate: false }]).execute)
    );
    const missing = new PostgresTribeEventPostEventRepository(
      createExecutor(createGuardedExecute([null]).execute)
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

  it("revalidates the slot under the membership and event locks before commenting", async () => {
    const { execute, statements } = createGuardedExecute([{ ...openGuard, is_occurrence: false }]);
    const repository = new PostgresTribeEventOccurrenceCommentRepository(createExecutor(execute));

    await expect(repository.create({ ...key, content: "Hola" })).resolves.toEqual({
      status: "invalid_occurrence",
    });
    expect(statements[0]).toContain("for share of tribe_members");
    expect(statements[1]).toContain("for share of events");
    expect(hasStatement(statements, "insert into public.event_occurrence_comments")).toBe(false);
  });

  it.each([
    ["forbidden", { ...openGuard, can_participate: false }],
    ["not_found", null],
  ] as const)("refuses a comment under the locked guard (%s)", async (status, guard) => {
    const { execute, statements } = createGuardedExecute([guard]);
    const repository = new PostgresTribeEventOccurrenceCommentRepository(createExecutor(execute));

    await expect(repository.create({ ...key, content: "Hola" })).resolves.toEqual({ status });
    expect(hasStatement(statements, "insert into public.event_occurrence_comments")).toBe(false);
  });

  it("reports forbidden and not found writes from the SQL status", async () => {
    const forbidden = new PostgresTribeEventOccurrenceCommentRepository(
      createExecutor(
        vi.fn(async (statement: unknown) =>
          getSqlText(statement).includes("is_tribe_event_series_occurrence")
            ? { rows: [openGuard] }
            : { rows: [{ status: "forbidden" }] }
        )
      )
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
