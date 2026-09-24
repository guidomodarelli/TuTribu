import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  convertRecordingToLessonRequest,
  deleteTribeEventCommentRequest,
  fetchTribeEventPostEventRequest,
  setTribeEventReactionRequest,
} from "@/lib/events/tribe-event-post-event-api-client";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const ORIGINAL_STARTS_AT = "2026-05-14T21:00:00.000Z";
const target = { eventId: EVENT_ID, originalStartsAt: ORIGINAL_STARTS_AT, tribeSlug: "matematica-pro" };

function mockResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  (global.fetch as Mock).mockResolvedValueOnce({ json: async () => body, ok, status });
}

describe("tribe event post-event API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("requests the occurrence by its original start and treats an unusable DTO as a failure", async () => {
    mockResponse({ postEvent: { isFinished: "yes" } });

    await expect(fetchTribeEventPostEventRequest(target)).resolves.toEqual({
      isSuccess: false,
      message: null,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/post-event?occurrence=${encodeURIComponent(ORIGINAL_STARTS_AT)}`,
      { signal: undefined }
    );
  });

  it("clears a reaction with DELETE and returns the safe message of a failure", async () => {
    mockResponse({ message: "Solo los miembros activos pueden reaccionar." }, false, 403);

    await expect(setTribeEventReactionRequest(target, null)).resolves.toEqual({
      isSuccess: false,
      message: "Solo los miembros activos pueden reaccionar.",
    });
    expect((global.fetch as Mock).mock.calls[0][1]).toEqual({ method: "DELETE" });
  });

  it("treats a comment that is already gone as deleted", async () => {
    mockResponse({ message: "No encontramos ese comentario." }, false, 404);

    await expect(
      deleteTribeEventCommentRequest({ commentId: "c1", tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ isAlreadyGone: true, isSuccess: true, message: null });
  });

  it("rejects a conversion answer whose lesson link is not internal", async () => {
    mockResponse({
      isExisting: false,
      lesson: {
        courseId: "66666666-cccc-4666-8666-666666666601",
        href: "//evil.example.com/cursos",
        id: "66666666-eeee-4666-8666-666666666601",
        title: "Taller",
      },
      message: "Lección creada en el curso.",
    });

    await expect(
      convertRecordingToLessonRequest("matematica-pro", {
        courseId: "66666666-cccc-4666-8666-666666666601",
        courseModuleId: "66666666-dddd-4666-8666-666666666601",
        description: null,
        eventId: EVENT_ID,
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        title: "Taller",
      })
    ).resolves.toEqual({ isSuccess: false, message: null });
  });
});
