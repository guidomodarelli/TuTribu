import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "beez-ui";
import type { ReactNode } from "react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { routeOccurrenceActivityRequests } from "@/tests/unit/components/events/support/occurrence-activity-fetch";

// Same Sonner double as the calendar suite: isolates its timers and global
// notification store so toasts can be asserted.
let apiFetch: Mock = vi.fn();

vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const MAY = { current: "2026-05", next: "2026-06", previous: "2026-04" };
const STARTS_AT = "2026-05-06T18:00:00.000Z";
const ANA = { id: "user-ana", image: null, name: "Ana Pérez" };
const JUAN = { id: "user-juan", image: "https://example.test/juan.png", name: "Juan" };

function createAttendance(
  overrides: Partial<TribeEventOccurrenceResult["attendance"]> = {}
): TribeEventOccurrenceResult["attendance"] {
  return {
    goingCount: 0,
    goingPreview: [],
    maybeCount: 0,
    viewerStatus: null,
    viewerWaitlistPosition: null,
    waitlistedCount: 0,
    ...overrides,
  };
}

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  return {
    attendance: createAttendance(),
    capacity: null,
    description: null,
    endsAt: "2026-05-06T19:00:00.000Z",
    eventId: EVENT_ID,
    meetingUrl: null,
    eventType: "live",
    exception: null,
    occurrenceKey: `${EVENT_ID}@${STARTS_AT}`,
    originalStartsAt: STARTS_AT,
    recurrenceFrequency: "weekly",
    recurrenceRule: "FREQ=WEEKLY",
    recurrenceUntil: null,
    seriesEndsAt: "2026-05-06T19:00:00.000Z",
    seriesStartsAt: STARTS_AT,
    startsAt: STARTS_AT,
    title: "Clase abierta",
    ...overrides,
  };
}

const router = {
  back: vi.fn(),
  bfcacheId: "tribe-events-attendance-test",
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
} satisfies AppRouterInstance;

function RouterProvider({ children }: { children: ReactNode }) {
  return <AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>;
}

function renderCalendar(props: Partial<React.ComponentProps<typeof TribeEventsCalendar>> = {}) {
  return render(
    <TribeEventsCalendar
      events={[createOccurrence()]}
      month={MAY}
      tribeSlug="matematica-pro"
      viewerPermissions={{ canManageEvents: false, canProposeEvents: false }}
      {...props}
    />,
    { wrapper: RouterProvider }
  );
}

function mockJsonResponse(body: Record<string, unknown>, ok = true) {
  apiFetch.mockResolvedValueOnce({ json: async () => body, ok });
}

describe("TribeEventsCalendar attendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch = vi.fn();
    global.fetch = routeOccurrenceActivityRequests(apiFetch);
    vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(
      new Date("2026-05-01T12:00:00.000Z")
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers Voy, Tal vez and No voy and records maybe without a route refresh", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });
    const answers = within(nextEvent).getByRole("group", { name: "¿Vas a participar?" });

    expect(within(answers).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Voy",
      "Tal vez",
      "No voy",
    ]);

    mockJsonResponse({
      attendance: createAttendance({ maybeCount: 1, viewerStatus: "maybe" }),
      message: "Respuesta guardada.",
    });
    await user.click(within(answers).getByRole("button", { name: "Tal vez" }));

    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
      occurrenceStartsAt: STARTS_AT,
      status: "maybe",
    });
    await waitFor(() =>
      expect(within(answers).getByRole("button", { name: "Tal vez" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(within(nextEvent).getByText("0 van · 1 tal vez")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows who is going with avatars, counts and free seats", async () => {
    renderCalendar({
      events: [
        createOccurrence({
          attendance: createAttendance({
            goingCount: 7,
            goingPreview: [ANA, JUAN],
            maybeCount: 3,
          }),
          capacity: 10,
        }),
      ],
    });

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });

    expect(within(nextEvent).getByText("Ana, Juan y 5 más van")).toBeInTheDocument();
    expect(within(nextEvent).getByText("7 van · 3 tal vez · Quedan 3 lugares")).toBeInTheDocument();
    expect(within(nextEvent).getByText("+5")).toBeInTheDocument();
  });

  it("reports a full occurrence with its waitlist in the agenda row", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence({
          attendance: createAttendance({
            goingCount: 10,
            goingPreview: [ANA],
            viewerStatus: "waitlisted",
            viewerWaitlistPosition: 2,
            waitlistedCount: 2,
          }),
          capacity: 10,
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    const agenda = screen.getByRole("region", { name: "Lista de eventos" });

    expect(within(agenda).getByText("En espera")).toBeInTheDocument();
    expect(within(agenda).getByText("10 van · Completo · 2 en espera")).toBeInTheDocument();
  });

  it("puts a going answer on the waitlist with its position when the event is full", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { toast } = vi.mocked(await import("beez-ui"), true);

    renderCalendar({
      events: [
        createOccurrence({
          attendance: createAttendance({ goingCount: 10, goingPreview: [ANA] }),
          capacity: 10,
        }),
      ],
    });

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });

    mockJsonResponse({
      attendance: createAttendance({
        goingCount: 10,
        goingPreview: [ANA],
        viewerStatus: "waitlisted",
        viewerWaitlistPosition: 1,
        waitlistedCount: 1,
      }),
      message: "El evento está completo: quedaste en la lista de espera.",
    });
    await user.click(within(nextEvent).getByRole("button", { name: "Voy" }));

    expect(
      await within(nextEvent).findByText("Estás en lista de espera · posición 1")
    ).toBeInTheDocument();
    expect(within(nextEvent).getByRole("button", { name: "Voy" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(toast.success).toHaveBeenCalledWith(
      "El evento está completo: quedaste en la lista de espera."
    );
  });

  it("shows the viewer streak only on the next event", async () => {
    renderCalendar({ attendanceStreak: { attendedCount: 4, occurrenceCount: 5 } });

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });

    expect(
      within(nextEvent).getByText("Fuiste a 4 de los últimos 5 encuentros 🔥")
    ).toBeInTheDocument();
  });

  it("hides the attendees tab from members who cannot manage events", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();
    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(within(dialog).queryByRole("tab", { name: "Asistentes" })).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("loads the attendees of the occurrence for managers only when the tab opens", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ viewerPermissions: { canManageEvents: true, canProposeEvents: false } });
    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(apiFetch).not.toHaveBeenCalled();

    mockJsonResponse({
      report: {
        attendeeGroups: {
          going: [{ name: "Ana Pérez", respondedAt: "2026-04-30T15:05:00.000Z", status: "going" }],
          maybe: [],
          notGoing: [],
          waitlisted: [{ name: "Beto", respondedAt: "2026-04-30T16:00:00.000Z", status: "waitlisted" }],
        },
        eventTitle: "Clase abierta",
        occurrenceStartsAt: STARTS_AT,
        trend: [
          { goingCount: 4, occurrenceStartsAt: "2026-04-22T18:00:00.000Z" },
          { goingCount: 6, occurrenceStartsAt: "2026-04-29T18:00:00.000Z" },
        ],
      },
    });
    await user.click(within(dialog).getByRole("tab", { name: "Asistentes" }));

    expect(apiFetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/attendance?occurrence=${encodeURIComponent(STARTS_AT)}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    const goingGroup = await within(dialog).findByRole("region", { name: "Van" });

    expect(within(goingGroup).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(goingGroup).getByText("30 abr · 12:05")).toBeInTheDocument();
    expect(
      within(within(dialog).getByRole("region", { name: "En espera" })).getByText("Beto")
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Exportar CSV" })).toHaveAttribute(
      "href",
      `/api/tribes/matematica-pro/events/${EVENT_ID}/attendance/export?occurrence=${encodeURIComponent(STARTS_AT)}`
    );
    expect(within(dialog).getByRole("listitem", { name: "22 abr: 4 personas" })).toBeInTheDocument();
    expect(within(dialog).getByRole("listitem", { name: "29 abr: 6 personas" })).toBeInTheDocument();
  });

  it("does not reload the attendees when the detail reopens on the default tab", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ viewerPermissions: { canManageEvents: true, canProposeEvents: false } });
    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    mockJsonResponse({
      report: {
        attendeeGroups: { going: [], maybe: [], notGoing: [], waitlisted: [] },
        eventTitle: "Clase abierta",
        occurrenceStartsAt: STARTS_AT,
        trend: [],
      },
    });
    await user.click(within(dialog).getByRole("tab", { name: "Asistentes" }));
    expect(
      await within(dialog).findByText("Todavía nadie respondió a esta fecha.")
    ).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // Closing while "Asistentes" is selected unmounts the tabs without
    // reporting a tab change, so the calendar must forget the open tab itself.
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Clase abierta" })).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const reopenedDialog = await screen.findByRole("dialog", { name: "Clase abierta" });

    expect(within(reopenedDialog).getByRole("tab", { name: "Detalle" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(apiFetch).toHaveBeenCalledTimes(1);

    mockJsonResponse({
      report: {
        attendeeGroups: { going: [], maybe: [], notGoing: [], waitlisted: [] },
        eventTitle: "Clase abierta",
        occurrenceStartsAt: STARTS_AT,
        trend: [],
      },
    });
    await user.click(within(reopenedDialog).getByRole("tab", { name: "Asistentes" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it("shows a safe error with retry when the attendees cannot be loaded", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ viewerPermissions: { canManageEvents: true, canProposeEvents: false } });
    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(within(dialog).getByRole("tab", { name: "Asistentes" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "No pudimos cargar la asistencia."
    );

    mockJsonResponse({
      report: {
        attendeeGroups: { going: [], maybe: [], notGoing: [], waitlisted: [] },
        eventTitle: "Clase abierta",
        occurrenceStartsAt: STARTS_AT,
        trend: [],
      },
    });
    await user.click(within(dialog).getByRole("button", { name: "Reintentar" }));

    expect(
      await within(dialog).findByText("Todavía nadie respondió a esta fecha.")
    ).toBeInTheDocument();
    // An occurrence without answers has nothing worth exporting.
    expect(within(dialog).queryByRole("link", { name: "Exportar CSV" })).not.toBeInTheDocument();
  });

  it("sends the capacity from the event form and validates it before saving", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [], viewerPermissions: { canManageEvents: true, canProposeEvents: false } });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Taller" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-05-20" } });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), { target: { value: "15:00" } });
    fireEvent.change(screen.getByLabelText("Cupo máximo (opcional)"), {
      target: { value: "0" },
    });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ingresá un cupo entre 1 y 10000, o dejalo vacío para no limitarlo."
    );
    expect(apiFetch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Cupo máximo (opcional)"), {
      target: { value: "12" },
    });
    mockJsonResponse({
      event: {},
      message: "Evento creado.",
      occurrences: [createOccurrence({ capacity: 12, title: "Taller" })],
    });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toMatchObject({
      capacity: "12",
      title: "Taller",
    });
  });

  describe("when the occurrence ends", () => {
    const ENDS_AT = "2026-05-06T19:00:00.000Z";
    const OCCURRENCE_ENDED_MESSAGE = "Este evento ya terminó; no se pueden cambiar las respuestas.";

    function answerStreakRefreshWithFailure() {
      // The finish watcher reads the streak again; its failure is silent.
      apiFetch.mockResolvedValue({ json: async () => ({}), ok: false });
    }

    it("hides the attendance controls at the exact end even when the page opened mid-minute", () => {
      // Plain fake timers: the clock must not drift with real time so the
      // boundary can be asserted to the millisecond.
      vi.useRealTimers();
      vi.useFakeTimers().setSystemTime(new Date("2026-05-06T18:59:30.500Z"));
      answerStreakRefreshWithFailure();

      renderCalendar();
      fireEvent.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

      const dialog = screen.getByRole("dialog");

      expect(within(dialog).getByRole("button", { name: "Voy" })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(Date.parse(ENDS_AT) - Date.now() - 1);
      });
      expect(within(dialog).getByRole("button", { name: "Voy" })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(within(dialog).queryByRole("button", { name: "Voy" })).not.toBeInTheDocument();
      expect(within(dialog).getByText("Finalizado")).toBeInTheDocument();
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("marks the occurrence finished when the server reports it ended before the local clock", async () => {
      vi.setSystemTime(new Date("2026-05-06T18:30:00.000Z"));
      answerStreakRefreshWithFailure();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderCalendar();
      await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

      const dialog = screen.getByRole("dialog");

      apiFetch.mockResolvedValueOnce({
        json: async () => ({ code: "occurrence_ended", message: OCCURRENCE_ENDED_MESSAGE }),
        ok: false,
        status: 409,
      });
      await user.click(within(dialog).getByRole("button", { name: "Voy" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(OCCURRENCE_ENDED_MESSAGE));
      await waitFor(() =>
        expect(within(dialog).queryByRole("button", { name: "Voy" })).not.toBeInTheDocument()
      );
      expect(within(dialog).getByText("Finalizado")).toBeInTheDocument();
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("keeps the attendance controls when the rejection is not about the end", async () => {
      vi.setSystemTime(new Date("2026-05-06T18:30:00.000Z"));
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderCalendar();
      await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

      const dialog = screen.getByRole("dialog");
      const scheduleChangedMessage = "El evento cambió; recargá para ver las fechas actualizadas.";

      apiFetch.mockResolvedValueOnce({
        json: async () => ({ message: scheduleChangedMessage }),
        ok: false,
        status: 409,
      });
      await user.click(within(dialog).getByRole("button", { name: "Voy" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(scheduleChangedMessage));
      expect(within(dialog).getByRole("button", { name: "Voy" })).toBeInTheDocument();
      expect(within(dialog).queryByText("Finalizado")).not.toBeInTheDocument();
    });
  });
});
