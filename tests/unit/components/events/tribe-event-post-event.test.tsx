import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { TribeEventOccurrenceActivity } from "@/components/events/tribe-event-occurrence-activity";
import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import { TRIBE_EVENT_REACTION_FLUSH_DELAY_MS } from "@/lib/events/tribe-event-post-event-state";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...(await vi.importActual<typeof import("beez-ui")>("beez-ui")),
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(),
    success: vi.fn(),
  },
}));

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const COMMENT_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const COURSE_ID = "66666666-cccc-4666-8666-666666666601";
const MODULE_ID = "66666666-dddd-4666-8666-666666666601";
const LESSON_ID = "66666666-eeee-4666-8666-666666666601";
const TRIBE_SLUG = "matematica-pro";
const ORIGINAL_STARTS_AT = "2026-05-14T21:00:00.000Z";
const OCCURRENCE_KEY = `${EVENT_ID}@${ORIGINAL_STARTS_AT}`;

const occurrence: TribeEventOccurrenceResult = {
  attendance: {
    goingCount: 0,
    goingPreview: [],
    maybeCount: 0,
    viewerStatus: null,
    viewerWaitlistPosition: null,
    waitlistedCount: 0,
  },
  capacity: null,
  description: "Repaso de la semana",
  endsAt: "2026-05-14T22:00:00.000Z",
  eventId: EVENT_ID,
  eventType: "workshop",
  exception: null,
  meetingUrl: null,
  occurrenceKey: OCCURRENCE_KEY,
  originalStartsAt: ORIGINAL_STARTS_AT,
  recurrenceFrequency: "weekly",
  recurrenceRule: "FREQ=WEEKLY",
  recurrenceUntil: null,
  seriesEndsAt: "2026-05-07T22:00:00.000Z",
  seriesStartsAt: "2026-05-07T21:00:00.000Z",
  startsAt: ORIGINAL_STARTS_AT,
  title: "Taller semanal",
};

function buildPostEvent(overrides: Record<string, unknown> = {}) {
  return {
    isCancelled: false,
    isFinished: true,
    materials: [{ title: "Slides", url: "https://example.com/slides" }],
    reactions: { counts: { fire: 2, neutral: 0, thumbs_up: 1 }, viewerReaction: null },
    recording: {
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      externalVideoId: "dQw4w9WgXcQ",
      provider: "youtube",
      sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    },
    viewerPermissions: { canConvertToLesson: true, canManageResources: true, canParticipate: true },
    ...overrides,
  };
}

type RouteResponse = { body: unknown; ok?: boolean; status?: number };
type RouteHandler = (init?: RequestInit) => RouteResponse | Promise<RouteResponse>;

/**
 * Fake of the post-event API: each handler answers a "METHOD path" key.
 */
function mockApi(handlers: Record<string, RouteHandler>) {
  (global.fetch as Mock).mockImplementation(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0].replace(`/api/tribes/${TRIBE_SLUG}`, "");
    const handler = handlers[`${init?.method ?? "GET"} ${path}`];

    if (!handler) {
      throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
    }

    const { body, ok = true, status = ok ? 200 : 500 } = await handler(init);

    return { json: async () => body, ok, status };
  });
}

const conversationHandler: RouteHandler = () => ({
  body: {
    canComment: true,
    comments: [
      {
        authorImageUrl: null,
        authorName: "Ana",
        canDelete: true,
        content: "¿Suben las slides?",
        createdAt: "2026-05-14T23:00:00.000Z",
        id: COMMENT_ID,
      },
    ],
  },
});

function renderActivity(isFinished = true) {
  return render(
    <TribeEventOccurrenceActivity
      isFinished={isFinished}
      occurrence={occurrence}
      tribeSlug={TRIBE_SLUG}
      onRecordingAvailabilityChange={vi.fn()}
    />
  );
}

describe("TribeEventOccurrenceActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the recording embed, its link, the materials and the reaction counts", async () => {
    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
    });

    renderActivity();

    expect(await screen.findByTitle("Grabación de Taller semanal")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
    expect(screen.getByRole("link", { name: "Abrir grabación" })).toHaveAttribute(
      "href",
      "https://youtu.be/dQw4w9WgXcQ"
    );
    expect(screen.getByRole("link", { name: "Slides" })).toHaveAttribute(
      "href",
      "https://example.com/slides"
    );
    expect(screen.getByRole("button", { name: "Estuvo genial: 2 personas" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Editar grabación y materiales" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convertir en lección" })).toBeInTheDocument();
    expect(await screen.findByText("¿Suben las slides?")).toBeInTheDocument();
  });

  it("hides manager actions and disables reactions for read-only members", async () => {
    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: () => ({ body: { canComment: false, comments: [] } }),
      [`GET /events/${EVENT_ID}/post-event`]: () => ({
        body: {
          postEvent: buildPostEvent({
            materials: [],
            recording: null,
            viewerPermissions: {
              canConvertToLesson: false,
              canManageResources: false,
              canParticipate: false,
            },
          }),
        },
      }),
    });

    renderActivity();

    expect(await screen.findByText("Todavía no hay grabación ni materiales.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /grabación y materiales/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estuvo bien: 1 persona" })).toBeDisabled();
    expect(
      await screen.findByText("Solo los miembros activos pueden participar en la conversación.")
    ).toBeInTheDocument();
  });

  it("only shows the conversation before the occurrence ends", async () => {
    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: () => ({ body: { canComment: true, comments: [] } }),
    });

    renderActivity(false);

    expect(
      await screen.findByText("Todavía no hay preguntas. ¿Querés preguntar algo antes del encuentro?")
    ).toBeInTheDocument();
    expect(screen.queryByText("Después del encuentro")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("applies reactions immediately and sends only the latest intent after the debounce", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reactionBodies: unknown[] = [];

    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
      [`PUT /events/${EVENT_ID}/reaction`]: (init) => {
        reactionBodies.push(JSON.parse(String(init?.body)));

        return {
          body: { reactions: { counts: { fire: 2, neutral: 0, thumbs_up: 2 }, viewerReaction: "thumbs_up" } },
        };
      },
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderActivity();
    await user.click(await screen.findByRole("button", { name: "Estuvo genial: 2 personas" }));

    expect(screen.getByRole("button", { name: "Estuvo genial: 3 personas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("button", { name: "Estuvo bien: 1 persona" }));

    expect(screen.getByRole("button", { name: "Estuvo bien: 2 personas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(reactionBodies).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRIBE_EVENT_REACTION_FLUSH_DELAY_MS);
    });

    await waitFor(() =>
      expect(reactionBodies).toEqual([{ occurrenceStartsAt: ORIGINAL_STARTS_AT, reaction: "thumbs_up" }])
    );
  });

  it("rolls the reaction back to the persisted counts when saving fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { toast } = await import("beez-ui");

    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
      [`PUT /events/${EVENT_ID}/reaction`]: () => ({
        body: { message: "Esta fecha todavía no terminó." },
        ok: false,
        status: 409,
      }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderActivity();
    await user.click(await screen.findByRole("button", { name: "Estuvo genial: 2 personas" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRIBE_EVENT_REACTION_FLUSH_DELAY_MS);
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Estuvo genial: 2 personas" })).toHaveAttribute(
        "aria-pressed",
        "false"
      )
    );
    expect(toast.error).toHaveBeenCalledWith("Esta fecha todavía no terminó.");
  });

  it("keeps an in-flight reaction when a resources save answers with the pre-reaction counts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onRecordingAvailabilityChange = vi.fn();
    let settleReaction: (response: RouteResponse) => void = () => undefined;
    const reactionBodies: unknown[] = [];

    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
      // The save persisted before the reaction: it still carries the old counts.
      [`PUT /events/${EVENT_ID}/post-event`]: () => ({
        body: { message: "Grabación y materiales guardados.", postEvent: buildPostEvent() },
      }),
      [`PUT /events/${EVENT_ID}/reaction`]: (init) => {
        reactionBodies.push(JSON.parse(String(init?.body)));

        return new Promise<RouteResponse>((resolve) => {
          settleReaction = resolve;
        });
      },
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <TribeEventOccurrenceActivity
        isFinished
        occurrence={occurrence}
        tribeSlug={TRIBE_SLUG}
        onRecordingAvailabilityChange={onRecordingAvailabilityChange}
      />
    );
    await user.click(await screen.findByRole("button", { name: "Estuvo bien: 1 persona" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRIBE_EVENT_REACTION_FLUSH_DELAY_MS);
    });
    await waitFor(() => expect(reactionBodies).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Editar grabación y materiales" }));

    const dialog = await screen.findByRole("dialog", { name: "Grabación y materiales" });

    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onRecordingAvailabilityChange).toHaveBeenLastCalledWith(OCCURRENCE_KEY, true));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Grabación y materiales" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Estuvo bien: 2 personas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await act(async () => {
      settleReaction({
        body: { reactions: { counts: { fire: 2, neutral: 0, thumbs_up: 2 }, viewerReaction: "thumbs_up" } },
      });
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Estuvo bien: 2 personas" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(reactionBodies).toHaveLength(1);
  });

  it("still sends a debounced reaction when a resources save finishes before the flush", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reactionBodies: unknown[] = [];

    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
      [`PUT /events/${EVENT_ID}/post-event`]: () => ({
        body: { message: "Grabación y materiales guardados.", postEvent: buildPostEvent() },
      }),
      [`PUT /events/${EVENT_ID}/reaction`]: (init) => {
        reactionBodies.push(JSON.parse(String(init?.body)));

        return {
          body: { reactions: { counts: { fire: 3, neutral: 0, thumbs_up: 1 }, viewerReaction: "fire" } },
        };
      },
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderActivity();
    await user.click(await screen.findByRole("button", { name: "Estuvo genial: 2 personas" }));
    await user.click(screen.getByRole("button", { name: "Editar grabación y materiales" }));

    const dialog = await screen.findByRole("dialog", { name: "Grabación y materiales" });

    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Grabación y materiales" })).not.toBeInTheDocument()
    );

    expect(screen.getByRole("button", { name: "Estuvo genial: 3 personas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRIBE_EVENT_REACTION_FLUSH_DELAY_MS);
    });

    await waitFor(() =>
      expect(reactionBodies).toEqual([{ occurrenceStartsAt: ORIGINAL_STARTS_AT, reaction: "fire" }])
    );
    expect(screen.getByRole("button", { name: "Estuvo genial: 3 personas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("keeps a completed reaction when an older resources save answers after it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onRecordingAvailabilityChange = vi.fn();
    let settleReaction: (response: RouteResponse) => void = () => undefined;
    let settleSave: (response: RouteResponse) => void = () => undefined;

    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({
        body: { postEvent: buildPostEvent({ recording: null }) },
      }),
      [`PUT /events/${EVENT_ID}/post-event`]: () =>
        new Promise<RouteResponse>((resolve) => {
          settleSave = resolve;
        }),
      [`PUT /events/${EVENT_ID}/reaction`]: () =>
        new Promise<RouteResponse>((resolve) => {
          settleReaction = resolve;
        }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <TribeEventOccurrenceActivity
        isFinished
        occurrence={occurrence}
        tribeSlug={TRIBE_SLUG}
        onRecordingAvailabilityChange={onRecordingAvailabilityChange}
      />
    );
    await user.click(await screen.findByRole("button", { name: "Estuvo bien: 1 persona" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRIBE_EVENT_REACTION_FLUSH_DELAY_MS);
    });
    await user.click(screen.getByRole("button", { name: "Editar grabación y materiales" }));

    const dialog = await screen.findByRole("dialog", { name: "Grabación y materiales" });

    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    // The reaction commits and answers first; the save read the old counts.
    await act(async () => {
      settleReaction({
        body: { reactions: { counts: { fire: 2, neutral: 0, thumbs_up: 2 }, viewerReaction: "thumbs_up" } },
      });
    });
    await act(async () => {
      settleSave({
        body: {
          message: "Grabación y materiales guardados.",
          postEvent: buildPostEvent({
            materials: [{ title: "Guía", url: "https://example.com/guia" }],
          }),
        },
      });
    });

    await waitFor(() => expect(onRecordingAvailabilityChange).toHaveBeenLastCalledWith(OCCURRENCE_KEY, true));
    expect(await screen.findByRole("link", { name: "Guía" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estuvo bien: 2 personas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("saves the recording and materials and reports the new availability", async () => {
    const onRecordingAvailabilityChange = vi.fn();
    const savedBodies: unknown[] = [];

    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({
        body: { postEvent: buildPostEvent({ materials: [], recording: null }) },
      }),
      [`PUT /events/${EVENT_ID}/post-event`]: (init) => {
        savedBodies.push(JSON.parse(String(init?.body)));

        return { body: { message: "Grabación y materiales guardados.", postEvent: buildPostEvent() } };
      },
    });

    const user = userEvent.setup();

    render(
      <TribeEventOccurrenceActivity
        isFinished
        occurrence={occurrence}
        tribeSlug={TRIBE_SLUG}
        onRecordingAvailabilityChange={onRecordingAvailabilityChange}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Agregar grabación y materiales" }));

    const dialog = await screen.findByRole("dialog", { name: "Grabación y materiales" });

    await user.type(
      within(dialog).getByLabelText("Link de la grabación (opcional)"),
      "https://youtu.be/dQw4w9WgXcQ"
    );
    await user.click(within(dialog).getByRole("button", { name: "Agregar material" }));
    await user.type(within(dialog).getByLabelText("Nombre del material 1"), "Slides");
    await user.type(within(dialog).getByLabelText("Link del material 1"), "ftp://example.com");
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Cada material necesita un nombre y un link que empiece con http o https."
    );
    expect(savedBodies).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText("Link del material 1"));
    await user.type(within(dialog).getByLabelText("Link del material 1"), "https://example.com/slides");
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onRecordingAvailabilityChange).toHaveBeenCalledWith(OCCURRENCE_KEY, true));
    expect(savedBodies).toEqual([
      {
        materials: [{ title: "Slides", url: "https://example.com/slides" }],
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        recordingUrl: "https://youtu.be/dQw4w9WgXcQ",
      },
    ]);
    expect(await screen.findByTitle("Grabación de Taller semanal")).toBeInTheDocument();
  });

  it("converts the recording into a lesson and links the existing one", async () => {
    const conversionBodies: unknown[] = [];

    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
      "GET /courses/lesson-targets": () => ({
        body: {
          courses: [{ id: COURSE_ID, modules: [{ id: MODULE_ID, title: "Talleres" }], title: "Grabaciones" }],
        },
      }),
      "POST /courses/lessons/from-event": (init) => {
        conversionBodies.push(JSON.parse(String(init?.body)));

        return {
          body: {
            isExisting: true,
            lesson: {
              courseId: COURSE_ID,
              href: `/${TRIBE_SLUG}/cursos?curso=${COURSE_ID}&leccion=${LESSON_ID}`,
              id: LESSON_ID,
              title: "Taller semanal · 14 may",
            },
            message: "Esta grabación ya es una lección de ese curso.",
          },
        };
      },
    });

    const user = userEvent.setup();

    renderActivity();
    await user.click(await screen.findByRole("button", { name: "Convertir en lección" }));

    const dialog = await screen.findByRole("dialog", { name: "Convertir en lección" });

    await user.click(within(dialog).getByRole("combobox", { name: "Curso" }));
    await user.click(await screen.findByRole("option", { name: "Grabaciones" }));
    await user.click(within(dialog).getByRole("button", { name: "Crear lección" }));

    expect(await within(dialog).findByText("Esta grabación ya era una lección de ese curso.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Ver lección" })).toHaveAttribute(
      "href",
      `/${TRIBE_SLUG}/cursos?curso=${COURSE_ID}&leccion=${LESSON_ID}`
    );
    expect(conversionBodies).toEqual([
      {
        courseId: COURSE_ID,
        courseModuleId: MODULE_ID,
        description: "Repaso de la semana",
        eventId: EVENT_ID,
        occurrenceStartsAt: ORIGINAL_STARTS_AT,
        title: expect.stringContaining("Taller semanal · "),
      },
    ]);
  });

  it("publishes and deletes conversation comments without reloading", async () => {
    mockApi({
      [`DELETE /events/comments/${COMMENT_ID}`]: () => ({ body: { message: "Comentario eliminado." } }),
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
      [`POST /events/${EVENT_ID}/comments`]: () => ({
        body: {
          comment: {
            authorImageUrl: null,
            authorName: "Beto",
            canDelete: true,
            content: "¡Gracias!",
            createdAt: "2026-05-15T10:00:00.000Z",
            id: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
          },
          message: "Comentario publicado.",
        },
      }),
    });

    const user = userEvent.setup();

    renderActivity();
    await user.type(await screen.findByLabelText("Escribí un comentario"), "¡Gracias!");
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    expect(await screen.findByText("¡Gracias!")).toBeInTheDocument();
    expect(screen.getByLabelText("Escribí un comentario")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Eliminar comentario de Ana" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(screen.queryByText("¿Suben las slides?")).not.toBeInTheDocument());
  });

  it("does not repeat a replayed comment the thread already shows", async () => {
    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
      [`POST /events/${EVENT_ID}/comments`]: () => ({
        body: {
          comment: {
            authorImageUrl: null,
            authorName: "Ana",
            canDelete: true,
            content: "¿Suben las slides?",
            createdAt: "2026-05-14T23:00:00.000Z",
            id: COMMENT_ID,
          },
          message: "Comentario publicado.",
        },
        status: 201,
      }),
    });

    const user = userEvent.setup();

    renderActivity();
    await user.type(await screen.findByLabelText("Escribí un comentario"), "¿Suben las slides?");
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(screen.getByLabelText("Escribí un comentario")).toHaveValue(""));
    expect(screen.getAllByText("¿Suben las slides?", { selector: "p" })).toHaveLength(1);
  });

  it("retries a failed comment with the same client request id and uses a new one afterwards", async () => {
    const sentClientRequestIds: string[] = [];
    let createAttempts = 0;

    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
      [`POST /events/${EVENT_ID}/comments`]: (init) => {
        const body = JSON.parse(String(init?.body)) as { clientRequestId: string; content: string };

        sentClientRequestIds.push(body.clientRequestId);
        createAttempts += 1;

        return createAttempts === 1
          ? { body: { message: "No pudimos publicar el comentario." }, ok: false, status: 500 }
          : {
              body: {
                comment: {
                  authorImageUrl: null,
                  authorName: "Beto",
                  canDelete: true,
                  content: body.content,
                  createdAt: "2026-05-15T10:00:00.000Z",
                  id: `7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0${createAttempts}`,
                },
                message: "Comentario publicado.",
              },
              status: 201,
            };
      },
    });

    const user = userEvent.setup();

    renderActivity();
    const commentInput = await screen.findByLabelText("Escribí un comentario");

    await user.type(commentInput, "¡Gracias!");
    await user.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(sentClientRequestIds).toHaveLength(1));
    expect(commentInput).toHaveValue("¡Gracias!");

    await user.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText("¡Gracias!", { selector: "p" })).toBeInTheDocument();

    await user.type(commentInput, "Otra consulta");
    await user.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText("Otra consulta", { selector: "p" })).toBeInTheDocument();

    expect(sentClientRequestIds).toHaveLength(3);
    expect(sentClientRequestIds[1]).toBe(sentClientRequestIds[0]);
    expect(sentClientRequestIds[2]).not.toBe(sentClientRequestIds[0]);
    expect(sentClientRequestIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe("TribeEventsCalendar recording badge", () => {
  const router = {
    back: vi.fn(),
    bfcacheId: "tribe-events-phase-6-test",
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  } satisfies AppRouterInstance;

  function RouterProvider({ children }: { children: ReactNode }) {
    return <AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    window.history.replaceState(null, "", `/${TRIBE_SLUG}/eventos`);
    vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(new Date("2026-05-20T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks recorded occurrences and opens the post-event block without refreshing the route", async () => {
    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <TribeEventsCalendar
        events={[occurrence]}
        month={{ current: "2026-05", next: "2026-06", previous: "2026-04" }}
        recordedOccurrenceKeys={[OCCURRENCE_KEY]}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageEvents: true, canProposeEvents: false }}
      />,
      { wrapper: RouterProvider }
    );

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    expect(await screen.findByText("Grabación disponible")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Taller semanal" })[0]);

    expect(await screen.findByTitle("Grabación de Taller semanal")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  function renderCalendar(recordedOccurrenceKeys: readonly string[]) {
    render(
      <TribeEventsCalendar
        events={[occurrence]}
        month={{ current: "2026-05", next: "2026-06", previous: "2026-04" }}
        recordedOccurrenceKeys={recordedOccurrenceKeys}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageEvents: true, canProposeEvents: false }}
      />,
      { wrapper: RouterProvider }
    );
  }

  it("adds the badge when opening an occurrence another manager recorded after the calendar loaded", async () => {
    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({ body: { postEvent: buildPostEvent() } }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar([]);
    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    expect(screen.queryByText("Grabación disponible")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Taller semanal" })[0]);

    expect(await screen.findByTitle("Grabación de Taller semanal")).toBeInTheDocument();
    expect(await screen.findByText("Grabación disponible")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("drops the stale badge when opening an occurrence whose recording was removed", async () => {
    mockApi({
      [`GET /events/${EVENT_ID}/comments`]: conversationHandler,
      [`GET /events/${EVENT_ID}/post-event`]: () => ({
        body: { postEvent: buildPostEvent({ materials: [], recording: null }) },
      }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar([OCCURRENCE_KEY]);
    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    expect(screen.getByText("Grabación disponible")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Taller semanal" })[0]);

    expect(await screen.findByText("Todavía no hay grabación ni materiales.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Grabación disponible")).not.toBeInTheDocument());
  });
});
