import { describe, expect, it, vi } from "vitest";

import {
  createTribeEventOccurrenceComment,
  getTribeEventPostEvent,
  getTribeEventRecordingLessonSource,
  listTribeEventOccurrenceComments,
  saveTribeEventPostEvent,
  setTribeEventOccurrenceReaction,
} from "@/src/modules/events/application/use-cases/tribe-event-post-event-use-cases";
import { TRIBE_EVENT_POST_EVENT_LIMIT } from "@/src/modules/events/constants/tribe-event-post-event";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventPostEventResources } from "@/src/modules/events/domain/repositories/tribe-event-post-event-repository";
import {
  createTribeEventExceptionRepositoryDouble,
  createTribeEventOccurrenceCommentRepositoryDouble,
  createTribeEventPostEventRepositoryDouble,
  createTribeEventRepositoryDouble,
} from "@/tests/unit/modules/events/support/tribe-event-repository-doubles";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const TRIBE_SLUG = "matematica-pro";
const ORIGINAL_STARTS_AT = "2026-05-14T21:00:00.000Z";
const AFTER_END = Date.parse("2026-05-14T23:00:00.000Z");
const DURING = Date.parse("2026-05-14T21:30:00.000Z");
const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const weeklySeries: TribeEvent = {
  capacity: null,
  description: "Repaso semanal",
  endsAt: "2026-05-07T22:00:00.000Z",
  eventType: "workshop",
  id: EVENT_ID,
  meetingUrl: null,
  recurrenceFrequency: "weekly",
  recurrenceUntil: null,
  startsAt: "2026-05-07T21:00:00.000Z",
  title: "Taller semanal",
};

const CLIENT_REQUEST_ID = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const occurrenceQuery = {
  eventId: EVENT_ID,
  originalStartsAt: ORIGINAL_STARTS_AT,
  tribeSlug: TRIBE_SLUG,
};

function buildResources(
  overrides: Partial<TribeEventPostEventResources> = {}
): TribeEventPostEventResources {
  return {
    materials: [],
    reactions: { counts: { fire: 0, neutral: 0, thumbs_up: 0 }, viewerReaction: null },
    recording: null,
    viewerPermissions: { canManageResources: true, canParticipate: true },
    ...overrides,
  };
}

function buildDependencies(nowTime: number, resources: TribeEventPostEventResources | null) {
  return {
    clock: () => nowTime,
    tribeEventOccurrenceCommentRepository: createTribeEventOccurrenceCommentRepositoryDouble(),
    tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
    tribeEventPostEventRepository: createTribeEventPostEventRepositoryDouble({
      getResources: vi.fn(async () => resources),
    }),
    tribeEventRepository: createTribeEventRepositoryDouble({
      findById: vi.fn(async () => weeklySeries),
    }),
  };
}

describe("getTribeEventPostEvent", () => {
  it("returns the resources with the recording ready to embed", async () => {
    const dependencies = buildDependencies(
      AFTER_END,
      buildResources({
        materials: [{ title: "Slides", url: "https://example.com/slides" }],
        recording: {
          externalVideoId: "dQw4w9WgXcQ",
          provider: "youtube",
          sourceUrl: YOUTUBE_URL,
        },
      })
    );

    const result = await getTribeEventPostEvent(dependencies)(occurrenceQuery);

    expect(result).toEqual({
      postEvent: {
        isCancelled: false,
        isFinished: true,
        materials: [{ title: "Slides", url: "https://example.com/slides" }],
        reactions: { counts: { fire: 0, neutral: 0, thumbs_up: 0 }, viewerReaction: null },
        recording: {
          embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
          externalVideoId: "dQw4w9WgXcQ",
          provider: "youtube",
          sourceUrl: YOUTUBE_URL,
          thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        },
        viewerPermissions: { canManageResources: true, canParticipate: true },
      },
      status: "found",
    });
  });

  it("rejects an instant that is not a slot of the series", async () => {
    const dependencies = buildDependencies(AFTER_END, buildResources());

    await expect(
      getTribeEventPostEvent(dependencies)({
        ...occurrenceQuery,
        originalStartsAt: "2026-05-15T21:00:00.000Z",
      })
    ).resolves.toEqual({ status: "invalid_occurrence" });
    expect(dependencies.tribeEventPostEventRepository.getResources).not.toHaveBeenCalled();
  });

  it("answers not found when the event is not readable", async () => {
    const dependencies = buildDependencies(AFTER_END, buildResources());

    vi.mocked(dependencies.tribeEventRepository.findById).mockResolvedValue(null);

    await expect(getTribeEventPostEvent(dependencies)(occurrenceQuery)).resolves.toEqual({
      status: "not_found",
    });
  });
});

describe("saveTribeEventPostEvent", () => {
  it("parses the recording URL and saves it with the materials", async () => {
    const dependencies = buildDependencies(AFTER_END, null);

    vi.mocked(dependencies.tribeEventPostEventRepository.saveResources).mockResolvedValue({
      resources: buildResources(),
      status: "post_event_saved",
    });

    const result = await saveTribeEventPostEvent(dependencies)({
      ...occurrenceQuery,
      materials: [{ title: "Slides", url: "https://example.com/slides" }],
      recordingUrl: ` ${YOUTUBE_URL} `,
    });

    expect(result.status).toBe("post_event_saved");
    expect(dependencies.tribeEventPostEventRepository.saveResources).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      materials: [{ title: "Slides", url: "https://example.com/slides" }],
      originalStartsAt: ORIGINAL_STARTS_AT,
      recording: {
        externalVideoId: "dQw4w9WgXcQ",
        provider: "youtube",
        sourceUrl: YOUTUBE_URL,
      },
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("rejects a recording URL of an unsupported provider", async () => {
    const dependencies = buildDependencies(AFTER_END, null);

    await expect(
      saveTribeEventPostEvent(dependencies)({
        ...occurrenceQuery,
        materials: [],
        recordingUrl: "https://example.com/video.mp4",
      })
    ).resolves.toEqual({ status: "invalid_recording_url" });
    expect(dependencies.tribeEventPostEventRepository.saveResources).not.toHaveBeenCalled();
  });

  it.each([
    [
      "Wistia",
      `https://fast.wistia.com/medias/${"a".repeat(TRIBE_EVENT_POST_EVENT_LIMIT.recordingExternalIdMaxLength + 1)}`,
    ],
    [
      "Vimeo",
      `https://vimeo.com/${"1".repeat(TRIBE_EVENT_POST_EVENT_LIMIT.recordingExternalIdMaxLength + 1)}`,
    ],
  ])(
    "rejects a %s recording whose parsed video id exceeds the stored id limit",
    async (_providerName, recordingUrl) => {
      const dependencies = buildDependencies(AFTER_END, null);

      await expect(
        saveTribeEventPostEvent(dependencies)({
          ...occurrenceQuery,
          materials: [],
          recordingUrl,
        })
      ).resolves.toEqual({ status: "invalid_recording_url" });
      expect(dependencies.tribeEventPostEventRepository.saveResources).not.toHaveBeenCalled();
    }
  );

  it("accepts a recording whose parsed video id has exactly the stored id limit", async () => {
    const dependencies = buildDependencies(AFTER_END, null);
    const externalVideoId = "a".repeat(TRIBE_EVENT_POST_EVENT_LIMIT.recordingExternalIdMaxLength);

    vi.mocked(dependencies.tribeEventPostEventRepository.saveResources).mockResolvedValue({
      status: "forbidden",
    });

    await saveTribeEventPostEvent(dependencies)({
      ...occurrenceQuery,
      materials: [],
      recordingUrl: `https://fast.wistia.com/medias/${externalVideoId}`,
    });

    expect(dependencies.tribeEventPostEventRepository.saveResources).toHaveBeenCalledWith(
      expect.objectContaining({
        recording: expect.objectContaining({ externalVideoId, provider: "wistia" }),
      })
    );
  });

  it("rejects an occurrence that did not finish yet", async () => {
    const dependencies = buildDependencies(DURING, null);

    await expect(
      saveTribeEventPostEvent(dependencies)({
        ...occurrenceQuery,
        materials: [],
        recordingUrl: YOUTUBE_URL,
      })
    ).resolves.toEqual({ status: "occurrence_not_finished" });
  });

  it("rejects a cancelled date", async () => {
    const dependencies = buildDependencies(AFTER_END, null);

    vi.mocked(dependencies.tribeEventOccurrenceExceptionRepository.find).mockResolvedValue({
      eventId: EVENT_ID,
      kind: "cancelled",
      newEndsAt: null,
      newStartsAt: null,
      originalStartsAt: ORIGINAL_STARTS_AT,
      reason: null,
    });

    await expect(
      saveTribeEventPostEvent(dependencies)({
        ...occurrenceQuery,
        materials: [],
        recordingUrl: null,
      })
    ).resolves.toEqual({ status: "occurrence_cancelled" });
  });

  it("uses the effective end of a moved date", async () => {
    const dependencies = buildDependencies(AFTER_END, null);

    vi.mocked(dependencies.tribeEventOccurrenceExceptionRepository.find).mockResolvedValue({
      eventId: EVENT_ID,
      kind: "moved",
      newEndsAt: null,
      newStartsAt: "2026-05-16T15:00:00.000Z",
      originalStartsAt: ORIGINAL_STARTS_AT,
      reason: null,
    });

    await expect(
      saveTribeEventPostEvent(dependencies)({
        ...occurrenceQuery,
        materials: [],
        recordingUrl: YOUTUBE_URL,
      })
    ).resolves.toEqual({ status: "occurrence_not_finished" });
  });

  it("passes the repository failure through", async () => {
    const dependencies = buildDependencies(AFTER_END, null);

    vi.mocked(dependencies.tribeEventPostEventRepository.saveResources).mockResolvedValue({
      status: "forbidden",
    });

    await expect(
      saveTribeEventPostEvent(dependencies)({
        ...occurrenceQuery,
        materials: [],
        recordingUrl: null,
      })
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("reports a date cancelled after it was resolved, as revalidated by the write", async () => {
    const dependencies = buildDependencies(AFTER_END, null);

    vi.mocked(dependencies.tribeEventPostEventRepository.saveResources).mockResolvedValue({
      status: "occurrence_cancelled",
    });

    await expect(
      saveTribeEventPostEvent(dependencies)({
        ...occurrenceQuery,
        materials: [],
        recordingUrl: YOUTUBE_URL,
      })
    ).resolves.toEqual({ status: "occurrence_cancelled" });
  });
});

describe("setTribeEventOccurrenceReaction", () => {
  it("reports an instant that stopped being a slot before the reaction was written", async () => {
    const dependencies = buildDependencies(AFTER_END, null);

    vi.mocked(dependencies.tribeEventPostEventRepository.setReaction).mockResolvedValue({
      status: "invalid_occurrence",
    });

    await expect(
      setTribeEventOccurrenceReaction(dependencies)({ ...occurrenceQuery, reaction: "fire" })
    ).resolves.toEqual({ status: "invalid_occurrence" });
  });

  it("saves a reaction on a finished occurrence", async () => {
    const dependencies = buildDependencies(AFTER_END, null);
    const reactions = { counts: { fire: 1, neutral: 0, thumbs_up: 0 }, viewerReaction: "fire" as const };

    vi.mocked(dependencies.tribeEventPostEventRepository.setReaction).mockResolvedValue({
      reactions,
      status: "reaction_saved",
    });

    await expect(
      setTribeEventOccurrenceReaction(dependencies)({ ...occurrenceQuery, reaction: "fire" })
    ).resolves.toEqual({ reactions, status: "reaction_saved" });
  });

  it("rejects a reaction before the occurrence ends", async () => {
    const dependencies = buildDependencies(DURING, null);

    await expect(
      setTribeEventOccurrenceReaction(dependencies)({ ...occurrenceQuery, reaction: "fire" })
    ).resolves.toEqual({ status: "occurrence_not_finished" });
    expect(dependencies.tribeEventPostEventRepository.setReaction).not.toHaveBeenCalled();
  });

  it("always lets a member remove their reaction", async () => {
    const dependencies = buildDependencies(DURING, null);

    vi.mocked(dependencies.tribeEventPostEventRepository.setReaction).mockResolvedValue({
      reactions: { counts: { fire: 0, neutral: 0, thumbs_up: 0 }, viewerReaction: null },
      status: "reaction_cleared",
    });

    await expect(
      setTribeEventOccurrenceReaction(dependencies)({ ...occurrenceQuery, reaction: null })
    ).resolves.toMatchObject({ status: "reaction_cleared" });
  });
});

describe("getTribeEventRecordingLessonSource", () => {
  it("returns the event copy and the recording video", async () => {
    const dependencies = buildDependencies(
      AFTER_END,
      buildResources({
        recording: {
          externalVideoId: "76979871",
          provider: "vimeo",
          sourceUrl: "https://vimeo.com/76979871",
        },
      })
    );

    await expect(
      getTribeEventRecordingLessonSource(dependencies)(occurrenceQuery)
    ).resolves.toEqual({
      source: {
        description: "Repaso semanal",
        eventId: EVENT_ID,
        externalVideoId: "76979871",
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        provider: "vimeo",
        startsAt: ORIGINAL_STARTS_AT,
        title: "Taller semanal",
      },
      status: "found",
    });
  });

  it("answers not found when the occurrence has no recording", async () => {
    const dependencies = buildDependencies(AFTER_END, buildResources());

    await expect(
      getTribeEventRecordingLessonSource(dependencies)(occurrenceQuery)
    ).resolves.toEqual({ status: "not_found" });
  });
});

describe("occurrence conversation", () => {
  it("lists the comments of a real occurrence", async () => {
    const dependencies = buildDependencies(DURING, null);

    vi.mocked(dependencies.tribeEventOccurrenceCommentRepository.list).mockResolvedValue({
      canComment: true,
      comments: [],
      status: "found",
    });

    await expect(
      listTribeEventOccurrenceComments(dependencies)(occurrenceQuery)
    ).resolves.toEqual({ canComment: true, comments: [], status: "found" });
  });

  it("accepts questions before the occurrence starts", async () => {
    const dependencies = buildDependencies(Date.parse("2026-05-01T12:00:00.000Z"), null);
    const comment = {
      authorImageUrl: null,
      authorName: "Ana",
      canDelete: true,
      content: "¿Hay que llevar algo?",
      createdAt: "2026-05-01T12:00:00.000Z",
      id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
    };

    vi.mocked(dependencies.tribeEventOccurrenceCommentRepository.create).mockResolvedValue({
      comment,
      status: "comment_created",
    });

    await expect(
      createTribeEventOccurrenceComment(dependencies)({
        ...occurrenceQuery,
        clientRequestId: CLIENT_REQUEST_ID,
        content: comment.content,
      })
    ).resolves.toEqual({ comment, status: "comment_created" });
    expect(dependencies.tribeEventOccurrenceCommentRepository.create).toHaveBeenCalledWith({
      ...occurrenceQuery,
      clientRequestId: CLIENT_REQUEST_ID,
      content: comment.content,
    });
  });

  it("rejects comments on an instant that is not a slot", async () => {
    const dependencies = buildDependencies(DURING, null);

    await expect(
      createTribeEventOccurrenceComment(dependencies)({
        ...occurrenceQuery,
        clientRequestId: CLIENT_REQUEST_ID,
        content: "Hola",
        originalStartsAt: "2026-05-15T21:00:00.000Z",
      })
    ).resolves.toEqual({ status: "invalid_occurrence" });
    expect(dependencies.tribeEventOccurrenceCommentRepository.create).not.toHaveBeenCalled();
  });
});
