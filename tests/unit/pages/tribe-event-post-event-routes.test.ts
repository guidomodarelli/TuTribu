import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { GET as GET_LESSON_TARGETS } from "@/app/api/tribes/[slug]/courses/lesson-targets/route";
import { POST as POST_LESSON_FROM_EVENT } from "@/app/api/tribes/[slug]/courses/lessons/from-event/route";
import { DELETE as DELETE_COMMENT } from "@/app/api/tribes/[slug]/events/comments/[commentId]/route";
import {
  GET as GET_COMMENTS,
  POST as POST_COMMENT,
} from "@/app/api/tribes/[slug]/events/[eventId]/comments/route";
import {
  GET as GET_POST_EVENT,
  PUT as PUT_POST_EVENT,
} from "@/app/api/tribes/[slug]/events/[eventId]/post-event/route";
import {
  DELETE as DELETE_REACTION,
  PUT as PUT_REACTION,
} from "@/app/api/tribes/[slug]/events/[eventId]/reaction/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();
const eventUseCases = {
  createTribeEventOccurrenceComment: vi.fn(),
  deleteTribeEventOccurrenceComment: vi.fn(),
  getTribeEventPostEvent: vi.fn(),
  getTribeEventRecordingLessonSource: vi.fn(),
  listTribeEventOccurrenceComments: vi.fn(),
  saveTribeEventPostEvent: vi.fn(),
  setTribeEventOccurrenceReaction: vi.fn(),
};
const courseUseCases = {
  canManageTribeCourses: vi.fn(),
  createLessonFromEventRecording: vi.fn(),
  listLessonConversionTargets: vi.fn(),
};
const logError = vi.fn();
const logWarn = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

// The logger writes to the console; the double lets the tests assert what is
// logged (issue paths and codes, never the rejected values).
vi.mock("@/src/modules/shared/infrastructure/observability/server-logger", () => ({
  createServerLogger: vi.fn(() => ({ error: logError, info: vi.fn(), warn: logWarn })),
}));

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const COMMENT_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const CLIENT_REQUEST_ID = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const COURSE_ID = "66666666-cccc-4666-8666-666666666601";
const MODULE_ID = "66666666-dddd-4666-8666-666666666601";
const LESSON_ID = "66666666-eeee-4666-8666-666666666601";
const TRIBE_SLUG = "matematica-pro";
const ORIGINAL_STARTS_AT = "2026-05-14T21:00:00.000Z";
const BASE_URL = `https://tutribu.example.com/api/tribes/${TRIBE_SLUG}/events/${EVENT_ID}`;

function buildRequest(url: string, body?: unknown): Request {
  return {
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
    url,
  } as unknown as Request;
}

function eventContext() {
  return { params: Promise.resolve({ eventId: EVENT_ID, slug: TRIBE_SLUG }) };
}

function tribeContext() {
  return { params: Promise.resolve({ slug: TRIBE_SLUG }) };
}

const postEvent = {
  isCancelled: false,
  isFinished: true,
  materials: [{ title: "Slides", url: "https://example.com/slides" }],
  reactions: { counts: { fire: 1, neutral: 0, thumbs_up: 0 }, viewerReaction: "fire" },
  recording: {
    embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    externalVideoId: "dQw4w9WgXcQ",
    provider: "youtube",
    sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  },
  viewerPermissions: { canManageResources: true, canParticipate: true },
};

const comment = {
  authorImageUrl: null,
  authorName: "Ana",
  canDelete: true,
  content: "¿Suben las slides?",
  createdAt: "2026-05-14T23:00:00.000Z",
  id: COMMENT_ID,
};

describe("post-event routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue({ id: "user-1" });
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      courses: { useCases: courseUseCases },
      events: { useCases: eventUseCases },
    });
  });

  it("answers 401 without a session", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await GET_POST_EVENT(
      buildRequest(`${BASE_URL}/post-event?occurrence=${ORIGINAL_STARTS_AT}`),
      eventContext()
    );

    expect(response.status).toBe(401);
    expect(eventUseCases.getTribeEventPostEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["module composition", () => (createRequestModules as Mock).mockRejectedValue(new Error("pool exhausted"))],
    ["session lookup", () => getAuthenticatedMember.mockRejectedValue(new Error("better-auth secret mismatch"))],
  ])(
    "answers a safe Spanish 500 on every post-event route when %s fails while opening the scope",
    async (_failure, arrangeFailure) => {
      arrangeFailure();

      const responses = await Promise.all([
        GET_POST_EVENT(
          buildRequest(`${BASE_URL}/post-event?occurrence=${ORIGINAL_STARTS_AT}`),
          eventContext()
        ),
        PUT_POST_EVENT(
          buildRequest(`${BASE_URL}/post-event`, {
            materials: [],
            occurrenceStartsAt: ORIGINAL_STARTS_AT,
            recordingUrl: null,
          }),
          eventContext()
        ),
        PUT_REACTION(
          buildRequest(`${BASE_URL}/reaction`, { occurrenceStartsAt: ORIGINAL_STARTS_AT, reaction: "fire" }),
          eventContext()
        ),
        DELETE_REACTION(
          buildRequest(`${BASE_URL}/reaction?occurrence=${ORIGINAL_STARTS_AT}`),
          eventContext()
        ),
        GET_COMMENTS(
          buildRequest(`${BASE_URL}/comments?occurrence=${ORIGINAL_STARTS_AT}`),
          eventContext()
        ),
        POST_COMMENT(
          buildRequest(`${BASE_URL}/comments`, {
            clientRequestId: CLIENT_REQUEST_ID,
            content: "Hola",
            occurrenceStartsAt: ORIGINAL_STARTS_AT,
          }),
          eventContext()
        ),
        DELETE_COMMENT(
          buildRequest(`https://tutribu.example.com/api/tribes/${TRIBE_SLUG}/events/comments/${COMMENT_ID}`),
          { params: Promise.resolve({ commentId: COMMENT_ID, slug: TRIBE_SLUG }) }
        ),
      ]);
      const bodies = await Promise.all(responses.map((response) => response.json()));

      expect(responses.map((response) => response.status)).toEqual(Array(7).fill(500));
      expect(bodies).toEqual([
        { message: "No pudimos cargar la grabación y los materiales. Intentá de nuevo." },
        { message: "No pudimos guardar la grabación y los materiales. Intentá de nuevo." },
        { message: "No pudimos guardar tu reacción. Intentá de nuevo." },
        { message: "No pudimos guardar tu reacción. Intentá de nuevo." },
        { message: "No pudimos cargar la conversación. Intentá de nuevo." },
        { message: "No pudimos actualizar la conversación. Intentá de nuevo." },
        { message: "No pudimos actualizar la conversación. Intentá de nuevo." },
      ]);
      expect(JSON.stringify(bodies)).not.toMatch(/pool exhausted|better-auth/);
      expect(logError).toHaveBeenCalledTimes(7);
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          message: "Tribe event post-event route scope setup failed",
        })
      );
      expect(eventUseCases.getTribeEventPostEvent).not.toHaveBeenCalled();
      expect(eventUseCases.saveTribeEventPostEvent).not.toHaveBeenCalled();
      expect(eventUseCases.setTribeEventOccurrenceReaction).not.toHaveBeenCalled();
      expect(eventUseCases.listTribeEventOccurrenceComments).not.toHaveBeenCalled();
      expect(eventUseCases.createTribeEventOccurrenceComment).not.toHaveBeenCalled();
      expect(eventUseCases.deleteTribeEventOccurrenceComment).not.toHaveBeenCalled();
    }
  );

  it("logs the scope setup failure with the request id of the call", async () => {
    const { createServerLogger } = await import(
      "@/src/modules/shared/infrastructure/observability/server-logger"
    );

    (createRequestModules as Mock).mockRejectedValue(new Error("pool exhausted"));

    await GET_POST_EVENT(
      {
        ...buildRequest(`${BASE_URL}/post-event?occurrence=${ORIGINAL_STARTS_AT}`),
        headers: new Headers({ "x-request-id": CLIENT_REQUEST_ID }),
      } as unknown as Request,
      eventContext()
    );

    expect(createServerLogger).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "tribe-event-post-event", requestId: CLIENT_REQUEST_ID })
    );
  });

  it("serves the post-event view with the course permission composed in", async () => {
    eventUseCases.getTribeEventPostEvent.mockResolvedValue({ postEvent, status: "found" });
    courseUseCases.canManageTribeCourses.mockResolvedValue(true);

    const response = await GET_POST_EVENT(
      buildRequest(`${BASE_URL}/post-event?occurrence=2026-05-14T18:00:00-03:00`),
      eventContext()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      postEvent: {
        ...postEvent,
        viewerPermissions: {
          canConvertToLesson: true,
          canManageResources: true,
          canParticipate: true,
        },
      },
    });
    expect(eventUseCases.getTribeEventPostEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      originalStartsAt: ORIGINAL_STARTS_AT,
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("does not ask courses for the permission when there is no recording", async () => {
    eventUseCases.getTribeEventPostEvent.mockResolvedValue({
      postEvent: { ...postEvent, recording: null },
      status: "found",
    });

    const response = await GET_POST_EVENT(
      buildRequest(`${BASE_URL}/post-event?occurrence=${ORIGINAL_STARTS_AT}`),
      eventContext()
    );

    expect((await response.json()).postEvent.viewerPermissions.canConvertToLesson).toBe(false);
    expect(courseUseCases.canManageTribeCourses).not.toHaveBeenCalled();
  });

  it("rejects a malformed occurrence before calling the use case", async () => {
    const response = await GET_POST_EVENT(
      buildRequest(`${BASE_URL}/post-event?occurrence=ayer`),
      eventContext()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Elegí una fecha válida del evento." });
    expect(JSON.stringify(logWarn.mock.calls)).not.toContain("ayer");
  });

  it("saves the recording and materials and maps business failures", async () => {
    eventUseCases.saveTribeEventPostEvent.mockResolvedValue({ postEvent, status: "post_event_saved" });

    const saved = await PUT_POST_EVENT(
      buildRequest(`${BASE_URL}/post-event`, {
        materials: [{ title: " Slides ", url: "https://example.com/slides" }],
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        recordingUrl: "https://youtu.be/dQw4w9WgXcQ",
      }),
      eventContext()
    );

    expect(saved.status).toBe(200);
    expect((await saved.json()).message).toBe("Grabación y materiales guardados.");
    expect(eventUseCases.saveTribeEventPostEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      materials: [{ title: "Slides", url: "https://example.com/slides" }],
      originalStartsAt: ORIGINAL_STARTS_AT,
      recordingUrl: "https://youtu.be/dQw4w9WgXcQ",
      tribeSlug: TRIBE_SLUG,
    });

    eventUseCases.saveTribeEventPostEvent.mockResolvedValue({ status: "occurrence_not_finished" });

    const early = await PUT_POST_EVENT(
      buildRequest(`${BASE_URL}/post-event`, {
        materials: [],
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        recordingUrl: null,
      }),
      eventContext()
    );

    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({ message: "Esta fecha todavía no terminó." });
  });

  it("rejects materials with a non-web link", async () => {
    const response = await PUT_POST_EVENT(
      buildRequest(`${BASE_URL}/post-event`, {
        materials: [{ title: "Script", url: "javascript:alert(1)" }],
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        recordingUrl: null,
      }),
      eventContext()
    );

    expect(response.status).toBe(400);
    expect(eventUseCases.saveTribeEventPostEvent).not.toHaveBeenCalled();
  });

  it("answers a safe 500 when the post-event DTO is unusable", async () => {
    eventUseCases.getTribeEventPostEvent.mockResolvedValue({
      postEvent: { ...postEvent, recording: { ...postEvent.recording, embedUrl: "javascript:x" } },
      status: "found",
    });
    courseUseCases.canManageTribeCourses.mockResolvedValue(false);

    const response = await GET_POST_EVENT(
      buildRequest(`${BASE_URL}/post-event?occurrence=${ORIGINAL_STARTS_AT}`),
      eventContext()
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "No pudimos cargar la grabación y los materiales. Intentá de nuevo.",
    });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: "public_dto_rejected" }) })
    );
  });

  it("sets and clears the viewer reaction", async () => {
    const reactions = { counts: { fire: 1, neutral: 0, thumbs_up: 0 }, viewerReaction: "fire" };

    eventUseCases.setTribeEventOccurrenceReaction.mockResolvedValue({ reactions, status: "reaction_saved" });

    const saved = await PUT_REACTION(
      buildRequest(`${BASE_URL}/reaction`, { occurrenceStartsAt: ORIGINAL_STARTS_AT, reaction: "fire" }),
      eventContext()
    );

    expect(await saved.json()).toEqual({ reactions });

    eventUseCases.setTribeEventOccurrenceReaction.mockResolvedValue({ status: "forbidden" });

    const cleared = await DELETE_REACTION(
      buildRequest(`${BASE_URL}/reaction?occurrence=${ORIGINAL_STARTS_AT}`),
      eventContext()
    );

    expect(cleared.status).toBe(403);
    expect(eventUseCases.setTribeEventOccurrenceReaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ reaction: null })
    );

    const invalid = await PUT_REACTION(
      buildRequest(`${BASE_URL}/reaction`, { occurrenceStartsAt: ORIGINAL_STARTS_AT, reaction: "heart" }),
      eventContext()
    );

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ message: "Elegí una reacción válida." });
  });

  it("lists, creates, and deletes conversation comments", async () => {
    eventUseCases.listTribeEventOccurrenceComments.mockResolvedValue({
      canComment: true,
      comments: [comment],
      status: "found",
    });
    eventUseCases.createTribeEventOccurrenceComment.mockResolvedValue({
      comment,
      status: "comment_created",
    });
    eventUseCases.deleteTribeEventOccurrenceComment.mockResolvedValue({ status: "not_found" });

    const listed = await GET_COMMENTS(
      buildRequest(`${BASE_URL}/comments?occurrence=${ORIGINAL_STARTS_AT}`),
      eventContext()
    );
    const created = await POST_COMMENT(
      buildRequest(`${BASE_URL}/comments`, {
        clientRequestId: CLIENT_REQUEST_ID,
        content: "  ¿Suben las slides?  ",
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
      }),
      eventContext()
    );
    const deleted = await DELETE_COMMENT(
      buildRequest(`https://tutribu.example.com/api/tribes/${TRIBE_SLUG}/events/comments/${COMMENT_ID}`),
      { params: Promise.resolve({ commentId: COMMENT_ID, slug: TRIBE_SLUG }) }
    );

    expect(await listed.json()).toEqual({ canComment: true, comments: [comment] });
    expect(created.status).toBe(201);
    expect(eventUseCases.createTribeEventOccurrenceComment).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: CLIENT_REQUEST_ID, content: "¿Suben las slides?" })
    );
    expect(deleted.status).toBe(404);
  });

  it("rejects an empty comment", async () => {
    const response = await POST_COMMENT(
      buildRequest(`${BASE_URL}/comments`, {
        clientRequestId: CLIENT_REQUEST_ID,
        content: "   ",
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
      }),
      eventContext()
    );

    expect(response.status).toBe(400);
    expect(eventUseCases.createTribeEventOccurrenceComment).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["not a uuid", "retry-1"],
  ])("rejects a comment whose client request id is %s", async (_case, clientRequestId) => {
    const response = await POST_COMMENT(
      buildRequest(`${BASE_URL}/comments`, {
        clientRequestId,
        content: "¿Suben las slides?",
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
      }),
      eventContext()
    );

    expect(response.status).toBe(400);
    expect(eventUseCases.createTribeEventOccurrenceComment).not.toHaveBeenCalled();
  });
});

describe("lesson conversion routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue({ id: "user-1" });
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      courses: { useCases: courseUseCases },
      events: { useCases: eventUseCases },
    });
  });

  const conversionBody = {
    courseId: COURSE_ID,
    courseModuleId: MODULE_ID,
    description: "Grabación",
    eventId: EVENT_ID,
    occurrenceStartsAt: ORIGINAL_STARTS_AT,
    title: "Taller semanal",
  };

  it("composes the recording of events into the courses command", async () => {
    eventUseCases.getTribeEventRecordingLessonSource.mockResolvedValue({
      source: {
        description: "Descripción del evento",
        eventId: EVENT_ID,
        externalVideoId: "dQw4w9WgXcQ",
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        provider: "youtube",
        startsAt: ORIGINAL_STARTS_AT,
        title: "Taller",
      },
      status: "found",
    });
    courseUseCases.createLessonFromEventRecording.mockResolvedValue({
      lesson: { courseId: COURSE_ID, courseModuleId: MODULE_ID, id: LESSON_ID, title: "Taller semanal" },
      status: "created",
    });

    const response = await POST_LESSON_FROM_EVENT(
      buildRequest("https://tutribu.example.com/api", conversionBody),
      tribeContext()
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      isExisting: false,
      lesson: {
        courseId: COURSE_ID,
        href: `/${TRIBE_SLUG}/cursos?curso=${COURSE_ID}&leccion=${LESSON_ID}`,
        id: LESSON_ID,
        title: "Taller semanal",
      },
      message: "Lección creada en el curso.",
    });
    expect(courseUseCases.createLessonFromEventRecording).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      courseModuleId: MODULE_ID,
      description: "Grabación",
      externalVideoId: "dQw4w9WgXcQ",
      sourceEventId: EVENT_ID,
      sourceOccurrenceStartsAt: ORIGINAL_STARTS_AT,
      title: "Taller semanal",
      tribeSlug: TRIBE_SLUG,
      videoProvider: "youtube",
    });
  });

  it("links the existing lesson instead of duplicating", async () => {
    eventUseCases.getTribeEventRecordingLessonSource.mockResolvedValue({
      source: {
        description: null,
        eventId: EVENT_ID,
        externalVideoId: "dQw4w9WgXcQ",
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        provider: "youtube",
        startsAt: ORIGINAL_STARTS_AT,
        title: "Taller",
      },
      status: "found",
    });
    courseUseCases.createLessonFromEventRecording.mockResolvedValue({
      lesson: { courseId: COURSE_ID, courseModuleId: MODULE_ID, id: LESSON_ID, title: "Taller semanal" },
      status: "existing",
    });

    const response = await POST_LESSON_FROM_EVENT(
      buildRequest("https://tutribu.example.com/api", conversionBody),
      tribeContext()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      isExisting: true,
      message: "Esta grabación ya es una lección de ese curso.",
    });
  });

  it("answers 409 when the recording changed before the lesson was created", async () => {
    eventUseCases.getTribeEventRecordingLessonSource.mockResolvedValue({
      source: {
        description: null,
        eventId: EVENT_ID,
        externalVideoId: "dQw4w9WgXcQ",
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        provider: "youtube",
        startsAt: ORIGINAL_STARTS_AT,
        title: "Taller",
      },
      status: "found",
    });
    courseUseCases.createLessonFromEventRecording.mockResolvedValue({
      status: "recording_changed",
    });

    const response = await POST_LESSON_FROM_EVENT(
      buildRequest("https://tutribu.example.com/api", conversionBody),
      tribeContext()
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: "La grabación cambió mientras creábamos la lección. Revisala y volvé a intentarlo.",
    });
  });

  it.each(["occurrence_not_finished", "occurrence_cancelled"])(
    "answers 409 without calling courses when the source occurrence is %s",
    async (status) => {
      eventUseCases.getTribeEventRecordingLessonSource.mockResolvedValue({ status });

      const response = await POST_LESSON_FROM_EVENT(
        buildRequest("https://tutribu.example.com/api", conversionBody),
        tribeContext()
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        message:
          "Esta fecha del evento todavía no terminó o fue cancelada. Revisala y volvé a intentarlo.",
      });
      expect(courseUseCases.createLessonFromEventRecording).not.toHaveBeenCalled();
    }
  );

  it("answers 409 when the occurrence stopped being finished before the lesson was created", async () => {
    eventUseCases.getTribeEventRecordingLessonSource.mockResolvedValue({
      source: {
        description: null,
        eventId: EVENT_ID,
        externalVideoId: "dQw4w9WgXcQ",
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        provider: "youtube",
        startsAt: ORIGINAL_STARTS_AT,
        title: "Taller",
      },
      status: "found",
    });
    courseUseCases.createLessonFromEventRecording.mockResolvedValue({
      status: "occurrence_unavailable",
    });

    const response = await POST_LESSON_FROM_EVENT(
      buildRequest("https://tutribu.example.com/api", conversionBody),
      tribeContext()
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message:
        "Esta fecha del evento todavía no terminó o fue cancelada. Revisala y volvé a intentarlo.",
    });
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ result: "occurrence_unavailable" }),
      })
    );
  });

  it("answers 404 without a recording and never calls courses", async () => {
    eventUseCases.getTribeEventRecordingLessonSource.mockResolvedValue({ status: "not_found" });

    const response = await POST_LESSON_FROM_EVENT(
      buildRequest("https://tutribu.example.com/api", conversionBody),
      tribeContext()
    );

    expect(response.status).toBe(404);
    expect(courseUseCases.createLessonFromEventRecording).not.toHaveBeenCalled();
  });

  it("rejects a malformed body at the boundary", async () => {
    const response = await POST_LESSON_FROM_EVENT(
      buildRequest("https://tutribu.example.com/api", { ...conversionBody, courseId: "1; drop" }),
      tribeContext()
    );

    expect(response.status).toBe(400);
    expect(eventUseCases.getTribeEventRecordingLessonSource).not.toHaveBeenCalled();
    expect(JSON.stringify(logWarn.mock.calls)).not.toContain("drop");
  });

  it.each([
    ["module composition", () => (createRequestModules as Mock).mockRejectedValue(new Error("pool exhausted"))],
    ["session lookup", () => getAuthenticatedMember.mockRejectedValue(new Error("better-auth secret mismatch"))],
  ])(
    "answers a safe Spanish 500 on every lesson conversion route when %s fails while opening the scope",
    async (_failure, arrangeFailure) => {
      arrangeFailure();

      const responses = await Promise.all([
        POST_LESSON_FROM_EVENT(
          buildRequest("https://tutribu.example.com/api", conversionBody),
          tribeContext()
        ),
        GET_LESSON_TARGETS(buildRequest("https://tutribu.example.com/api"), tribeContext()),
      ]);
      const bodies = await Promise.all(responses.map((response) => response.json()));

      expect(responses.map((response) => response.status)).toEqual([500, 500]);
      expect(bodies).toEqual([
        { message: "No pudimos crear la lección. Intentá de nuevo." },
        { message: "No pudimos cargar los cursos. Intentá de nuevo." },
      ]);
      expect(JSON.stringify(bodies)).not.toMatch(/pool exhausted|better-auth/);
      expect(logError).toHaveBeenCalledTimes(2);
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          message: "Lesson conversion route scope setup failed",
        })
      );
      expect(eventUseCases.getTribeEventRecordingLessonSource).not.toHaveBeenCalled();
      expect(courseUseCases.createLessonFromEventRecording).not.toHaveBeenCalled();
      expect(courseUseCases.listLessonConversionTargets).not.toHaveBeenCalled();
    }
  );

  it("logs the lesson conversion scope setup failure with the request id of the call", async () => {
    const { createServerLogger } = await import(
      "@/src/modules/shared/infrastructure/observability/server-logger"
    );

    (createRequestModules as Mock).mockRejectedValue(new Error("pool exhausted"));

    await POST_LESSON_FROM_EVENT(
      {
        ...buildRequest("https://tutribu.example.com/api", conversionBody),
        headers: new Headers({ "x-request-id": CLIENT_REQUEST_ID }),
      } as unknown as Request,
      tribeContext()
    );

    expect(createServerLogger).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "lesson-from-event-recording", requestId: CLIENT_REQUEST_ID })
    );
  });

  it("answers 401 on the lesson conversion routes without a session", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const responses = await Promise.all([
      POST_LESSON_FROM_EVENT(
        buildRequest("https://tutribu.example.com/api", conversionBody),
        tribeContext()
      ),
      GET_LESSON_TARGETS(buildRequest("https://tutribu.example.com/api"), tribeContext()),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    expect(await responses[0].json()).toEqual({ message: "Iniciá sesión para gestionar los cursos." });
    expect(eventUseCases.getTribeEventRecordingLessonSource).not.toHaveBeenCalled();
    expect(courseUseCases.listLessonConversionTargets).not.toHaveBeenCalled();
  });

  it("lists the conversion targets only for course managers", async () => {
    courseUseCases.listLessonConversionTargets.mockResolvedValueOnce({
      courses: [{ id: COURSE_ID, modules: [{ id: MODULE_ID, title: "Talleres" }], title: "Grabaciones" }],
      status: "found",
    });
    courseUseCases.listLessonConversionTargets.mockResolvedValueOnce({ status: "forbidden" });

    const allowed = await GET_LESSON_TARGETS(
      buildRequest("https://tutribu.example.com/api"),
      tribeContext()
    );
    const denied = await GET_LESSON_TARGETS(buildRequest("https://tutribu.example.com/api"), tribeContext());

    expect(await allowed.json()).toEqual({
      courses: [{ id: COURSE_ID, modules: [{ id: MODULE_ID, title: "Talleres" }], title: "Grabaciones" }],
    });
    expect(denied.status).toBe(403);
  });
});
