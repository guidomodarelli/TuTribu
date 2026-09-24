import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import type {
  TribeEventOccurrenceResult,
  TribeEventResult,
} from "@/src/modules/events/application/results/tribe-event-result";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OTHER_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const MAY = {
  current: "2026-05",
  next: "2026-06",
  previous: "2026-04",
};

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
  const startsAt = overrides.startsAt ?? "2026-05-06T18:00:00.000Z";
  const eventId = overrides.eventId ?? EVENT_ID;

  return {
    attendance: createAttendance({ goingCount: 2, viewerStatus: null }),
    capacity: null,
    description: "Repaso mensual",
    endsAt: "2026-05-06T19:00:00.000Z",
    eventId,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    occurrenceKey: `${eventId}@${startsAt}`,
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    seriesEndsAt: "2026-05-06T19:00:00.000Z",
    seriesStartsAt: startsAt,
    startsAt,
    title: "Clase abierta",
    ...overrides,
  };
}

/**
 * Saved series as the create/update endpoints return it (public DTO).
 */
function createEventDto(
  overrides: Partial<TribeEventResult> = {}
): TribeEventResult {
  return {
    capacity: null,
    description: "Repaso mensual",
    endsAt: "2026-05-06T19:00:00.000Z",
    id: EVENT_ID,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    recurrenceFrequency: "none",
    recurrenceRule: null,
    recurrenceUntil: null,
    startsAt: "2026-05-06T18:00:00.000Z",
    title: "Clase abierta",
    ...overrides,
  };
}

/**
 * Router double provided through Next's own context (the boundary
 * `useRouter` reads), so navigation calls can be asserted without mocking
 * the `next/navigation` module.
 */
const router = {
  back: vi.fn(),
  bfcacheId: "tribe-events-test",
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
} satisfies AppRouterInstance;

function RouterProvider({ children }: { children: ReactNode }) {
  return <AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>;
}

function renderCalendar(
  props: Partial<React.ComponentProps<typeof TribeEventsCalendar>> = {}
) {
  return render(
    <TribeEventsCalendar
      events={[createOccurrence()]}
      month={MAY}
      tribeSlug="matematica-pro"
      viewerPermissions={{ canManageEvents: true }}
      {...props}
    />,
    { wrapper: RouterProvider }
  );
}

function mockJsonResponse(body: Record<string, unknown>, ok = true) {
  (global.fetch as Mock).mockResolvedValueOnce({
    json: async () => body,
    ok,
  });
}

describe("TribeEventsCalendar", () => {
  const occurrence = createOccurrence();
  const nextMonthOccurrence = createOccurrence({
    description: "Planificación mensual",
    endsAt: "2026-06-10T19:00:00.000Z",
    eventId: OTHER_EVENT_ID,
    meetingUrl: null,
    startsAt: "2026-06-10T18:00:00.000Z",
    title: "Encuentro de junio",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // The fixtures live in May 2026; pin "now" before them so the occurrences
    // are upcoming (attendance enabled) regardless of the real date.
    vi
      .useFakeTimers({ shouldAdvanceTime: true })
      .setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a monthly calendar table with events and navigation", () => {
    renderCalendar();

    expect(screen.getByRole("heading", { name: "Mayo 2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mes anterior" })).toHaveAttribute(
      "href",
      "/matematica-pro/eventos?month=2026-04"
    );
    expect(screen.getByRole("link", { name: "Mes siguiente" })).toHaveAttribute(
      "href",
      "/matematica-pro/eventos?month=2026-06"
    );
    expect(screen.getByRole("link", { name: "Hoy" })).toHaveAttribute(
      "href",
      "/matematica-pro/eventos?month=2026-05"
    );
    expect(
      screen.getByRole("table", { name: "Calendario mensual de eventos" })
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Lun" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /15:00\s*Clase abierta/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear evento" })).toBeInTheDocument();
  });

  it("points the today link at the Buenos Aires month of the clock", () => {
    // 02:00 UTC on June 1st is still May 31st in Buenos Aires.
    vi.setSystemTime(new Date("2026-06-01T02:00:00.000Z"));

    renderCalendar();

    expect(screen.getByRole("link", { name: "Hoy" })).toHaveAttribute(
      "href",
      "/matematica-pro/eventos?month=2026-05"
    );
  });

  it("switches to the event list table with attendance counts", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    const agenda = screen.getByRole("region", { name: "Lista de eventos" });

    expect(
      within(agenda).getByRole("heading", { name: "Miércoles 6 de mayo" })
    ).toBeInTheDocument();
    expect(within(agenda).getByRole("button", { name: "Clase abierta" })).toBeInTheDocument();
    expect(within(agenda).getByText("15:00 - 16:00")).toBeInTheDocument();
    expect(within(agenda).getByText("2 van")).toBeInTheDocument();
    expect(
      within(agenda).getByRole("link", { name: "Abrir link" })
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  });

  it("adds the viewer local time when their time zone is not Buenos Aires", async () => {
    // Emulate a browser in Madrid: only the reported zone changes, formatting
    // stays real. Fake timers wrap `Intl.DateTimeFormat` and bind the native
    // methods, so spy on the native prototype that owns `resolvedOptions`.
    let dateTimeFormatPrototype = Intl.DateTimeFormat.prototype;

    while (!Object.hasOwn(dateTimeFormatPrototype, "resolvedOptions")) {
      dateTimeFormatPrototype = Object.getPrototypeOf(dateTimeFormatPrototype);
    }

    const realResolvedOptions = dateTimeFormatPrototype.resolvedOptions;
    const resolvedOptionsSpy = vi
      .spyOn(dateTimeFormatPrototype, "resolvedOptions")
      .mockImplementation(function (this: Intl.DateTimeFormat) {
        return { ...realResolvedOptions.call(this), timeZone: "Europe/Madrid" };
      });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    try {
      renderCalendar();

      const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });

      expect(within(nextEvent).getByText(/20:00 - 21:00 tu hora/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ver lista" }));

      const agenda = screen.getByRole("region", { name: "Lista de eventos" });

      expect(within(agenda).getByText("15:00 - 16:00")).toBeInTheDocument();
      expect(within(agenda).getByText("20:00 - 21:00 tu hora")).toBeInTheDocument();

      await user.click(within(agenda).getByRole("button", { name: "Clase abierta" }));

      expect(
        within(screen.getByRole("dialog", { name: "Clase abierta" })).getByText(
          "20:00 - 21:00 tu hora"
        )
      ).toBeInTheDocument();
    } finally {
      resolvedOptionsSpy.mockRestore();
    }
  });

  it("offers adding each agenda occurrence to Google Calendar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    const agenda = screen.getByRole("region", { name: "Lista de eventos" });
    const calendarLink = within(agenda).getByRole("link", {
      name: "Agregar a Google Calendar",
    });
    const calendarUrl = new URL(calendarLink.getAttribute("href") ?? "");

    expect(calendarUrl.origin).toBe("https://calendar.google.com");
    expect(calendarUrl.searchParams.get("text")).toBe("Clase abierta");
    expect(calendarUrl.searchParams.get("dates")).toBe("20260506T180000Z/20260506T190000Z");
    expect(calendarLink).toHaveAttribute("title", "Agregar a Google Calendar");
    expect(calendarLink).toHaveAttribute("target", "_blank");
  });

  it("leaves the Google Calendar shortcut out of finished agenda occurrences", async () => {
    vi.setSystemTime(new Date("2026-05-07T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    const agenda = screen.getByRole("region", { name: "Lista de eventos" });

    expect(within(agenda).getByText("Finalizado")).toBeInTheDocument();
    expect(
      within(agenda).queryByRole("link", { name: "Agregar a Google Calendar" })
    ).not.toBeInTheDocument();
  });

  it("groups the agenda by day, marks today and shows the viewer answer and recurrence", async () => {
    vi.setSystemTime(new Date("2026-05-06T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const weeklyOccurrence = createOccurrence({
      attendance: createAttendance({ goingCount: 4, viewerStatus: "going" }),
      endsAt: "2026-05-13T19:00:00.000Z",
      eventId: OTHER_EVENT_ID,
      recurrenceFrequency: "weekly",
      recurrenceRule: "FREQ=WEEKLY",
      startsAt: "2026-05-13T18:00:00.000Z",
      title: "Office hours",
    });

    renderCalendar({ events: [weeklyOccurrence, occurrence] });

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    const agenda = screen.getByRole("region", { name: "Lista de eventos" });
    const [firstDay, secondDay] = within(agenda).getAllByRole("heading", { level: 2 });

    expect(firstDay).toHaveTextContent("Miércoles 6 de mayo");
    expect(firstDay).toHaveTextContent("Hoy");
    expect(secondDay).toHaveTextContent("Miércoles 13 de mayo");
    expect(within(agenda).getByText("Vas")).toBeInTheDocument();
    expect(within(agenda).getByText("Todas las semanas")).toBeInTheDocument();
  });

  it("wraps each agenda day heading and its events in their own day block", async () => {
    vi.setSystemTime(new Date("2026-05-06T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const laterOccurrence = createOccurrence({
      endsAt: "2026-05-13T19:00:00.000Z",
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-13T18:00:00.000Z",
      title: "Cierre de mes",
    });

    renderCalendar({ events: [laterOccurrence, occurrence] });

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    const agenda = screen.getByRole("region", { name: "Lista de eventos" });
    const [firstDayHeading, secondDayHeading] = within(agenda).getAllByRole("heading", {
      level: 2,
    });
    const firstDayBlock = firstDayHeading.closest("section");
    const secondDayBlock = secondDayHeading.closest("section");

    expect(firstDayBlock).not.toBe(agenda);
    expect(secondDayBlock).not.toBe(agenda);
    expect(firstDayBlock).not.toBe(secondDayBlock);
    expect(within(firstDayBlock as HTMLElement).getByRole("list")).toBeInTheDocument();
    expect(within(firstDayBlock as HTMLElement).queryByText("Cierre de mes")).not.toBeInTheDocument();
    expect(within(secondDayBlock as HTMLElement).getByText("Cierre de mes")).toBeInTheDocument();
  });

  it("shows members a quiet empty state when the month has no events", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [], viewerPermissions: { canManageEvents: false } });

    expect(screen.getByText("No hay eventos este mes.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    expect(screen.queryByRole("region", { name: "Lista de eventos" })).not.toBeInTheDocument();
    expect(screen.getByText("No hay eventos este mes.")).toBeInTheDocument();
  });

  it("keeps the member empty state free of templates", () => {
    renderCalendar({ events: [], viewerPermissions: { canManageEvents: false } });

    expect(screen.queryByText("Creá tu primer encuentro")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Preguntas y respuestas semanal/ })).not.toBeInTheDocument();
  });

  it("offers managers templates that prefill the create form", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    expect(screen.getByText("Creá tu primer encuentro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preguntas y respuestas semanal/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Taller en vivo/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Encuentro de arranque mensual/ }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo evento" });

    expect(within(dialog).getByLabelText("Título")).toHaveValue("Encuentro de arranque mensual");
    expect(within(dialog).getByLabelText("Repetición")).toHaveTextContent("Todos los meses");

    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "18:00" },
    });

    // The template duration (90 min) drives the suggested end time.
    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("19:30");
  });

  it("carries a template duration that crosses midnight into the next day", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: /Taller en vivo/ }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo evento" });

    fireEvent.change(within(dialog).getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "23:00" },
    });

    // The 120-minute workshop ends at 01:00 of the next Buenos Aires day.
    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("01:00");
    expect(
      within(dialog).getByRole("checkbox", { name: "Termina otro día" })
    ).toBeChecked();
    expect(within(dialog).getByLabelText("Fecha de fin")).toHaveValue("2026-05-21");

    mockJsonResponse({ event: createEventDto(), message: "Evento creado.", occurrences: [] });
    await user.click(within(dialog).getByRole("button", { name: "Guardar evento" }));

    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toMatchObject({
      endsAt: "2026-05-21T04:00:00.000Z",
      startsAt: "2026-05-21T02:00:00.000Z",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("fills the next-day end date once the date is picked after a crossing start", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: /Taller en vivo/ }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo evento" });

    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "23:30" },
    });

    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("01:30");

    fireEvent.change(within(dialog).getByLabelText("Fecha"), {
      target: { value: "2026-05-31" },
    });

    expect(within(dialog).getByLabelText("Fecha de fin")).toHaveValue("2026-06-01");
  });

  it("recomputes the template end every time the start changes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: /Encuentro de arranque mensual/ }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo evento" });

    fireEvent.change(within(dialog).getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "18:00" },
    });
    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("19:30");

    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "19:00" },
    });
    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("20:30");

    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "20:00" },
    });
    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("21:30");

    mockJsonResponse({ event: createEventDto(), message: "Evento creado.", occurrences: [] });
    await user.click(within(dialog).getByRole("button", { name: "Guardar evento" }));

    // The saved event keeps the advertised 90 minutes.
    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toMatchObject({
      endsAt: "2026-05-21T00:30:00.000Z",
      startsAt: "2026-05-20T23:00:00.000Z",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("moves a suggested next-day end back to the start day when the start moves earlier", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: /Taller en vivo/ }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo evento" });

    fireEvent.change(within(dialog).getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "23:00" },
    });
    expect(within(dialog).getByLabelText("Fecha de fin")).toHaveValue("2026-05-21");

    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "20:00" },
    });

    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("22:00");
    expect(
      within(dialog).getByRole("checkbox", { name: "Termina otro día" })
    ).not.toBeChecked();
    expect(within(dialog).queryByLabelText("Fecha de fin")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "23:30" },
    });

    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("01:30");
    expect(within(dialog).getByLabelText("Fecha de fin")).toHaveValue("2026-05-21");
  });

  it("stops recomputing the template end once the manager edits the end date", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: /Taller en vivo/ }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo evento" });

    fireEvent.change(within(dialog).getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "23:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Fecha de fin"), {
      target: { value: "2026-05-22" },
    });
    fireEvent.change(within(dialog).getByLabelText("Hora de inicio"), {
      target: { value: "20:00" },
    });

    expect(within(dialog).getByLabelText("Hora de fin")).toHaveValue("01:00");
    expect(within(dialog).getByLabelText("Fecha de fin")).toHaveValue("2026-05-22");
  });

  it("updates visible events when the route month changes", () => {
    const { rerender } = renderCalendar();

    rerender(
      <TribeEventsCalendar
        events={[nextMonthOccurrence]}
        month={{
          current: "2026-06",
          next: "2026-07",
          previous: "2026-05",
        }}
        tribeSlug="matematica-pro"
        viewerPermissions={{ canManageEvents: true }}
      />
    );

    expect(screen.getByRole("heading", { name: "Junio 2026" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /15:00\s*Encuentro de junio/ })
    ).toBeInTheDocument();
    expect(screen.queryByText("Clase abierta")).not.toBeInTheDocument();
  });

  it("highlights the next event, today, and finished occurrences", async () => {
    vi.setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
    const pastOccurrence = createOccurrence({
      endsAt: "2026-05-03T19:00:00.000Z",
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-03T18:00:00.000Z",
      title: "Ronda pasada",
    });

    renderCalendar({ events: [pastOccurrence, occurrence] });

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });

    expect(within(nextEvent).getByText("Clase abierta")).toBeInTheDocument();
    expect(screen.getByRole("cell", { current: "date" })).toHaveTextContent("5");

    fireEvent.click(screen.getByRole("button", { name: "Ver lista" }));

    expect(screen.queryByText("Ronda pasada")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver 1 finalizado" }));

    expect(screen.getByText("Ronda pasada")).toBeInTheDocument();
    expect(screen.getByText("Finalizado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar finalizados" })).toBeInTheDocument();
  });

  it("keeps the block and element classes on today, finished, and out-of-month states", async () => {
    vi.setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
    const pastOccurrence = createOccurrence({
      endsAt: "2026-05-03T19:00:00.000Z",
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-03T18:00:00.000Z",
      title: "Ronda pasada",
    });

    const { container } = renderCalendar({ events: [pastOccurrence, occurrence] });

    await screen.findByRole("region", { name: "Próximo evento" });

    expect(screen.getByRole("cell", { current: "date" })).toHaveClass(
      "TribeEventsMonthGrid__dayCell",
      "TribeEventsMonthGrid__dayCell--today"
    );
    expect(screen.getByRole("button", { name: /Ronda pasada/ })).toHaveClass(
      "TribeEventsMonthGrid__eventPill",
      "TribeEventsMonthGrid__eventPill--past"
    );

    const pastDot = container.querySelector(".TribeEventsMonthGrid__dayDot--past");
    const mutedDayNumber = container.querySelector(".TribeEventsMonthGrid__dayNumber--muted");

    expect(pastDot).toHaveClass("TribeEventsMonthGrid__dayDot");
    expect(mutedDayNumber).toHaveClass("TribeEventsMonthGrid__dayNumber");

    fireEvent.click(screen.getByRole("button", { name: "Ver lista" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver 1 finalizado" }));

    expect(screen.getByText("Ronda pasada").closest("li")).toHaveClass(
      "TribeEventAgendaItem",
      "TribeEventAgendaItem--past"
    );
  });

  it("shows a running occurrence as live with a join link and a live agenda badge", async () => {
    vi.setSystemTime(new Date("2026-05-06T18:10:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });

    expect(within(nextEvent).getByText("En vivo ahora")).toBeInTheDocument();
    expect(within(nextEvent).getByRole("link", { name: "Unirme" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij"
    );
    expect(within(nextEvent).getByRole("link", { name: "Unirme" })).toHaveAttribute(
      "target",
      "_blank"
    );
    expect(within(nextEvent).getByRole("link", { name: "Unirme" })).toHaveAttribute(
      "rel",
      "noreferrer"
    );

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    const agenda = screen.getByRole("region", { name: "Lista de eventos" });

    expect(within(agenda).getByText("En vivo")).toBeInTheDocument();
    expect(within(agenda).queryByText("Finalizado")).not.toBeInTheDocument();
  });

  it("counts down to the next occurrence and offers joining 15 minutes before", async () => {
    vi.setSystemTime(new Date("2026-05-03T18:00:00.000Z"));

    const { unmount } = renderCalendar();
    const farNextEvent = await screen.findByRole("region", { name: "Próximo evento" });

    expect(within(farNextEvent).getByText("Empieza en 3 días")).toBeInTheDocument();
    expect(within(farNextEvent).queryByRole("link", { name: "Unirme" })).not.toBeInTheDocument();
    unmount();

    vi.setSystemTime(new Date("2026-05-06T17:52:00.000Z"));
    renderCalendar();

    const closeNextEvent = await screen.findByRole("region", { name: "Próximo evento" });

    expect(within(closeNextEvent).getByText("Empieza en 8 min")).toBeInTheDocument();
    expect(within(closeNextEvent).getByRole("link", { name: "Unirme" })).toBeInTheDocument();
  });

  it("treats an occurrence without end as running for the default duration", async () => {
    vi.setSystemTime(new Date("2026-05-06T18:30:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [createOccurrence({ endsAt: null })] });

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });

    expect(within(nextEvent).getByText("En vivo ahora")).toBeInTheDocument();

    await user.click(within(nextEvent).getByRole("button", { name: "Ver detalle" }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(within(dialog).queryByText("Finalizado")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Voy" })).toBeInTheDocument();
  });

  describe("occurrence deep links", () => {
    const eventsRoute = "/matematica-pro/eventos?month=2026-05";
    const readEventQuery = () => new URL(window.location.href).searchParams.get("event");

    afterEach(() => {
      window.history.replaceState(null, "", "/");
      Reflect.deleteProperty(navigator, "clipboard");
    });

    it("opens the deep-linked occurrence and syncs the URL without navigating", async () => {
      window.history.replaceState(
        null,
        "",
        eventsRoute + "&event=" + encodeURIComponent(occurrence.occurrenceKey)
      );
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderCalendar({ initialOccurrenceKey: occurrence.occurrenceKey });

      expect(await screen.findByRole("dialog", { name: "Clase abierta" })).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(readEventQuery()).toBeNull();
      expect(new URL(window.location.href).searchParams.get("month")).toBe("2026-05");

      await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

      expect(readEventQuery()).toBe(occurrence.occurrenceKey);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("keeps the rendered month in the URL when closing a monthless deep link", async () => {
      window.history.replaceState(
        null,
        "",
        "/matematica-pro/eventos?event=" + encodeURIComponent(occurrence.occurrenceKey)
      );
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderCalendar({ initialOccurrenceKey: occurrence.occurrenceKey });

      expect(await screen.findByRole("dialog", { name: "Clase abierta" })).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(window.location.pathname).toBe("/matematica-pro/eventos");
      expect(window.location.search).toBe("?month=2026-05");

      await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

      const reopenedUrl = new URL(window.location.href);

      expect(reopenedUrl.searchParams.get("month")).toBe("2026-05");
      expect(reopenedUrl.searchParams.get("event")).toBe(occurrence.occurrenceKey);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("ignores a deep link to an occurrence that is not on screen", () => {
      renderCalendar({ initialOccurrenceKey: `${OTHER_EVENT_ID}@2026-05-20T18:00:00.000Z` });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("copies the occurrence link from the detail", async () => {
      const { toast } = vi.mocked(await import("beez-ui"), true);
      const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
      // user-event installs its own clipboard stub on setup, so define ours after it.
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });

      renderCalendar();

      await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
      await user.click(screen.getByRole("button", { name: "Copiar link" }));

      const copiedUrl = new URL(writeText.mock.calls[0]?.[0] ?? "");

      expect(copiedUrl.origin).toBe(window.location.origin);
      expect(copiedUrl.pathname).toBe("/matematica-pro/eventos");
      expect(copiedUrl.searchParams.get("month")).toBe("2026-05");
      expect(copiedUrl.searchParams.get("event")).toBe(occurrence.occurrenceKey);
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link copiado."));
    });

    it("reports a copy failure when the browser cannot write to the clipboard", async () => {
      const { toast } = vi.mocked(await import("beez-ui"), true);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      });

      renderCalendar();

      await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
      await user.click(screen.getByRole("button", { name: "Copiar link" }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("No pudimos copiar el link.")
      );
    });
  });

  describe("month swipe and day overflow", () => {
    const startPoint = { clientX: 200, clientY: 300, identifier: 1 };

    function swipe(target: Element, deltaX: number, deltaY = 0) {
      fireEvent.touchStart(target, { changedTouches: [startPoint], touches: [startPoint] });
      fireEvent.touchEnd(target, {
        changedTouches: [
          { ...startPoint, clientX: startPoint.clientX + deltaX, clientY: startPoint.clientY + deltaY },
        ],
        touches: [],
      });
    }

    it("navigates to the next and previous month with horizontal touch swipes", () => {
      renderCalendar();

      const grid = screen.getByRole("table", { name: "Calendario mensual de eventos" });

      swipe(grid, -120);
      expect(router.push).toHaveBeenLastCalledWith("/matematica-pro/eventos?month=2026-06");

      swipe(grid, 120);
      expect(router.push).toHaveBeenLastCalledWith("/matematica-pro/eventos?month=2026-04");
    });

    it("swipes the agenda too and ignores vertical drags and pinches", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderCalendar();
      await user.click(screen.getByRole("button", { name: "Ver lista" }));

      const agenda = screen.getByRole("region", { name: "Lista de eventos" });

      swipe(agenda, -30, 200);
      fireEvent.touchStart(agenda, {
        changedTouches: [startPoint],
        touches: [startPoint, { ...startPoint, identifier: 2 }],
      });
      fireEvent.touchEnd(agenda, {
        changedTouches: [{ ...startPoint, clientX: 20 }],
        touches: [],
      });
      expect(router.push).not.toHaveBeenCalled();

      swipe(agenda, -120);
      expect(router.push).toHaveBeenCalledWith("/matematica-pro/eventos?month=2026-06");
    });

    it("shows how many occurrences do not fit as dots", () => {
      renderCalendar({
        events: Array.from({ length: 5 }, (_, index) =>
          createOccurrence({
            eventId: `${EVENT_ID.slice(0, -1)}${index}`,
            title: `Encuentro ${index + 1}`,
          })
        ),
      });

      expect(
        screen.getByRole("button", { name: "Miércoles 6 de mayo: 5 eventos" })
      ).toHaveTextContent("+2");
    });
  });

  it("keeps every occurrence visible when browsing a month that is entirely past", async () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    expect(screen.getByRole("button", { name: "Clase abierta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalizado/ })).not.toBeInTheDocument();
  });

  it("records the viewer attendance from the next event block without opening the detail", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });
    const goingButton = within(nextEvent).getByRole("button", { name: "Voy" });

    expect(goingButton).toHaveAttribute("aria-pressed", "false");

    mockJsonResponse({
      attendance: createAttendance({ goingCount: 3, viewerStatus: "going" }),
      message: "Respuesta guardada.",
    });
    await user.click(goingButton);

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/attendance`,
      expect.objectContaining({ method: "PUT" })
    );
    await waitFor(() =>
      expect(within(nextEvent).getByRole("button", { name: "Voy" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the event detail with description, attendance, and calendar exports", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ viewerPermissions: { canManageEvents: false } });

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(within(dialog).getByText("Repaso mensual")).toBeInTheDocument();
    expect(within(dialog).getByText("2 van")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Abrir link de reunión" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij"
    );
    expect(
      within(dialog).getByRole("link", { name: "Agregar a Google Calendar" })
    ).toHaveAttribute("href", expect.stringContaining("https://calendar.google.com/"));
    expect(within(dialog).getByRole("link", { name: "Descargar .ics" })).toHaveAttribute(
      "href",
      `/api/tribes/matematica-pro/events/${EVENT_ID}/calendar`
    );
    expect(within(dialog).getByRole("button", { name: "Voy" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear evento" })).not.toBeInTheDocument();
  });

  it("exports the whole series from the detail of a later recurring occurrence", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence({
          endsAt: "2026-05-20T19:00:00.000Z",
          recurrenceFrequency: "weekly",
          recurrenceRule: "FREQ=WEEKLY",
          seriesStartsAt: "2026-05-06T18:00:00.000Z",
          startsAt: "2026-05-20T18:00:00.000Z",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });
    const calendarUrl = new URL(
      within(dialog)
        .getByRole("link", { name: "Agregar a Google Calendar" })
        .getAttribute("href") ?? ""
    );

    expect(calendarUrl.searchParams.get("dates")).toBe("20260506T180000Z/20260506T190000Z");
    expect(calendarUrl.searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY");
  });

  it("records and clears the viewer attendance from the detail", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
    mockJsonResponse({
      attendance: createAttendance({ goingCount: 3, viewerStatus: "going" }),
      message: "Respuesta guardada.",
    });
    await user.click(screen.getByRole("button", { name: "Voy" }));

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/attendance`,
      expect.objectContaining({ method: "PUT" })
    );
    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toEqual({
      occurrenceStartsAt: "2026-05-06T18:00:00.000Z",
      status: "going" as const,
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Voy" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(within(screen.getByRole("dialog")).getByText("3 van")).toBeInTheDocument();

    mockJsonResponse({
      attendance: createAttendance({ goingCount: 2, viewerStatus: null }),
      message: "Respuesta eliminada.",
    });
    await user.click(screen.getByRole("button", { name: "Voy" }));

    expect(global.fetch).toHaveBeenLastCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/attendance?occurrence=${encodeURIComponent(
        "2026-05-06T18:00:00.000Z"
      )}`,
      expect.objectContaining({ method: "DELETE" })
    );
    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByText("2 van")).toBeInTheDocument()
    );
  });

  it("creates an event through the tribe event endpoint and shows it without reloading", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const createdOccurrence = createOccurrence({
      attendance: createAttendance({ goingCount: 0, viewerStatus: null }),
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-20T18:00:00.000Z",
      title: "Clase nueva",
    });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Clase nueva" },
    });
    fireEvent.change(screen.getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "15:00" },
    });
    fireEvent.change(screen.getByLabelText("Link de reunión"), {
      target: { value: "https://meet.google.com/abc-defg-hij" },
    });
    mockJsonResponse({
      event: createEventDto({ id: OTHER_EVENT_ID, title: "Clase nueva" }),
      message: "Evento creado.",
      occurrences: [createdOccurrence],
    });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/events?month=2026-05",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toEqual({
      capacity: "",
      description: "",
      endsAt: "2026-05-20T19:00:00.000Z",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      recurrenceFrequency: "none",
      recurrenceUntil: "",
      startsAt: "2026-05-20T18:00:00.000Z",
      title: "Clase nueva",
    });
    expect(
      await screen.findByRole("button", { name: /15:00\s*Clase nueva/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("suggests an end time one hour after the start without overriding an explicit one", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "15:00" },
    });

    expect(screen.getByLabelText("Hora de fin")).toHaveValue("16:00");

    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "15:30" },
    });

    // A suggested end keeps following the start until the manager edits it.
    expect(screen.getByLabelText("Hora de fin")).toHaveValue("16:30");

    fireEvent.change(screen.getByLabelText("Hora de fin"), {
      target: { value: "17:30" },
    });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "16:00" },
    });

    expect(screen.getByLabelText("Hora de fin")).toHaveValue("17:30");
  });

  it("lists the tapped day's events under the grid", async () => {
    vi.setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const laterOccurrence = createOccurrence({
      endsAt: "2026-05-20T19:00:00.000Z",
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-20T18:00:00.000Z",
      title: "Cierre de mes",
    });

    renderCalendar({ events: [occurrence, laterOccurrence] });

    expect(screen.queryByRole("region", { name: "Eventos del día" })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Miércoles 20 de mayo: 1 evento" })
    );

    const daySummary = screen.getByRole("region", { name: "Eventos del día" });

    expect(
      within(daySummary).getByRole("heading", { name: "Miércoles 20 de mayo" })
    ).toBeInTheDocument();
    expect(within(daySummary).getByRole("button", { name: "Cierre de mes" })).toBeInTheDocument();
    expect(within(daySummary).queryByText("Clase abierta")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Miércoles 20 de mayo: 1 evento" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("renders a finished event without link or description as a compact summary", async () => {
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence({
          attendance: createAttendance({ goingCount: 1, viewerStatus: null }),
          description: null,
          endsAt: null,
          meetingUrl: null,
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(within(dialog).getByText("Finalizado")).toBeInTheDocument();
    expect(within(dialog).getByText("Sin link de reunión")).toBeInTheDocument();
    expect(within(dialog).queryByText("Descripción")).not.toBeInTheDocument();
    expect(within(dialog).getByText("1 fue")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Voy" })).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Descargar .ics" })
    ).toBeInTheDocument();
  });

  it("shows the recurrence next to the schedule in the detail header", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence({
          recurrenceFrequency: "weekly",
          recurrenceRule: "FREQ=WEEKLY",
          recurrenceUntil: "2026-06-30T23:59:00.000Z",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(
      within(dialog).getByText(/Miércoles 6 de mayo · 15:00 - 16:00 · Todas las semanas hasta el 30 jun/)
    ).toBeInTheDocument();
  });

  it("validates the schedule inline before sending the form", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Clase nueva" },
    });
    fireEvent.change(screen.getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "15:00" },
    });
    fireEvent.change(screen.getByLabelText("Hora de fin"), {
      target: { value: "14:00" },
    });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "La fecha de fin debe ser posterior al inicio."
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("supports events that end on a later day", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Vigilia" },
    });
    fireEvent.change(screen.getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "23:00" },
    });
    expect(screen.queryByLabelText("Fecha de fin")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Termina otro día" }));
    fireEvent.change(screen.getByLabelText("Fecha de fin"), {
      target: { value: "2026-05-21" },
    });
    fireEvent.change(screen.getByLabelText("Hora de fin"), {
      target: { value: "01:00" },
    });
    mockJsonResponse({ event: createEventDto(), message: "Evento creado.", occurrences: [] });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toMatchObject({
      endsAt: "2026-05-21T04:00:00.000Z",
      startsAt: "2026-05-21T02:00:00.000Z",
    });
    // Let the save settle (form closes) so its state updates land inside the test.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("prevents duplicate event creation while the save request is pending", async () => {
    let resolveRequest: (value: {
      json: () => Promise<Record<string, unknown>>;
      ok: boolean;
    }) => void = () => undefined;
    (global.fetch as Mock).mockImplementationOnce(
      function () { return new Promise((resolve) => {
          resolveRequest = resolve;
        }); }
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    await user.type(screen.getByLabelText("Título"), "Clase abierta");
    await user.type(screen.getByLabelText("Fecha"), "2026-05-06");
    await user.type(screen.getByLabelText("Hora de inicio"), "15:00");
    const saveButton = screen.getByRole("button", { name: "Guardar evento" });

    await user.click(saveButton);
    await waitFor(() => expect(saveButton).toBeDisabled());
    await user.click(saveButton);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveRequest({
      json: async () => ({
        event: createEventDto(),
        message: "Evento creado.",
        occurrences: [occurrence],
      }),
      ok: true,
    });

    expect(
      await screen.findByRole("button", { name: /15:00\s*Clase abierta/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits an event from the detail and shows the attendance returned by the save", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByRole("dialog", { name: "Editar evento" })).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("Clase abierta");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-05-06");
    expect(screen.getByLabelText("Hora de inicio")).toHaveValue("15:00");
    expect(screen.getByLabelText("Hora de fin")).toHaveValue("16:00");

    // Moving the start never overwrites the saved end of the event.
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "14:00" },
    });
    expect(screen.getByLabelText("Hora de fin")).toHaveValue("16:00");
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "15:00" },
    });

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Clase cerrada" },
    });
    mockJsonResponse({
      event: createEventDto({ title: "Clase cerrada" }),
      message: "Evento actualizado.",
      occurrences: [
        createOccurrence({
          attendance: createAttendance({ goingCount: 3, viewerStatus: "going" }),
          title: "Clase cerrada",
        }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}?month=2026-05`,
      expect.objectContaining({ method: "PATCH" })
    );
    // The edit always sends the capacity explicitly (empty = no limit), so the
    // server never mistakes it for a legacy body that omits the field.
    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toMatchObject({
      capacity: "",
      title: "Clase cerrada",
    });
    expect(await screen.findByRole("button", { name: /15:00\s*Clase cerrada/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase cerrada/ }));

    expect(within(screen.getByRole("dialog")).getByText("3 van")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting an event", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    const confirmation = screen.getByRole("alertdialog", { name: "¿Eliminar este evento?" });

    await user.click(within(confirmation).getByRole("button", { name: "Cancelar" }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /15:00\s*Clase abierta/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    mockJsonResponse({ message: "Evento eliminado." });
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}`,
      expect.objectContaining({ method: "DELETE" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /15:00\s*Clase abierta/ })).not.toBeInTheDocument()
    );
  });

  describe("attendance streak after series mutations", () => {
    const initialStreak = { attendedCount: 4, occurrenceCount: 5 };
    const seriesStreakEndpoint = "/api/tribes/matematica-pro/events/attendance-streak";
    const laterOccurrence = createOccurrence({
      endsAt: "2026-05-20T19:00:00.000Z",
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-20T18:00:00.000Z",
      title: "Encuentro abierto",
    });

    async function editFirstOccurrence(responseBody: Record<string, unknown>) {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
      await user.click(screen.getByRole("button", { name: "Editar" }));
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Clase cerrada" },
      });
      mockJsonResponse({
        event: createEventDto(),
        message: "Evento actualizado.",
        occurrences: [createOccurrence({ title: "Clase cerrada" })],
        ...responseBody,
      });
      await user.click(screen.getByRole("button", { name: "Guardar evento" }));
      await screen.findByRole("button", { name: /15:00\s*Clase cerrada/ });
    }

    async function deleteFirstOccurrence(responseBody: Record<string, unknown>) {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
      await user.click(screen.getByRole("button", { name: "Eliminar" }));
      mockJsonResponse({ message: "Evento eliminado.", ...responseBody });
      await user.click(
        within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" })
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: /15:00\s*Clase abierta/ })
        ).not.toBeInTheDocument()
      );
    }

    function getNextEventRegion() {
      return screen.getByRole("region", { name: "Próximo evento" });
    }

    it("shows the streak returned by an edit without reloading the route", async () => {
      renderCalendar({ attendanceStreak: initialStreak });

      await editFirstOccurrence({
        attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
        attendanceStreakNextRefreshAt: null,
      });

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 2 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("shows the streak returned by a creation without reloading the route", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderCalendar({ attendanceStreak: initialStreak });

      await user.click(screen.getByRole("button", { name: "Crear evento" }));
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Clase histórica" },
      });
      fireEvent.change(screen.getByLabelText("Fecha"), {
        target: { value: "2026-05-20" },
      });
      fireEvent.change(screen.getByLabelText("Hora de inicio"), {
        target: { value: "15:00" },
      });
      mockJsonResponse({
        attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
        attendanceStreakNextRefreshAt: null,
        event: createEventDto(),
        message: "Evento creado.",
        occurrences: [laterOccurrence],
      });
      await user.click(screen.getByRole("button", { name: "Guardar evento" }));

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 3 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("hides the streak when a deletion leaves the viewer without one", async () => {
      renderCalendar({
        attendanceStreak: initialStreak,
        events: [occurrence, laterOccurrence],
      });

      await deleteFirstOccurrence({ attendanceStreak: null, attendanceStreakNextRefreshAt: null });

      expect(
        await within(getNextEventRegion()).findByText("Encuentro abierto")
      ).toBeInTheDocument();
      expect(within(getNextEventRegion()).queryByText(/Fuiste a/)).not.toBeInTheDocument();
      expect(router.refresh).not.toHaveBeenCalled();
    });

    /**
     * Answers the follow-up streak read with the given streak; the mutation
     * itself still consumes the response queued with `mockJsonResponse`.
     */
    function answerStreakReads(attendanceStreak: Record<string, unknown>) {
      (global.fetch as Mock).mockImplementation(async (url: string) =>
        url === seriesStreakEndpoint
          ? { json: async () => ({ attendanceStreak, attendanceStreakNextRefreshAt: null }), ok: true }
          : Promise.reject(new Error(`Unexpected request to ${url}`))
      );
    }

    function getSeriesStreakRequests() {
      return (global.fetch as Mock).mock.calls.filter(([url]) => url === seriesStreakEndpoint);
    }

    it("reads the streak once when the mutation response omits it", async () => {
      renderCalendar({
        attendanceStreak: initialStreak,
        events: [occurrence, laterOccurrence],
      });
      answerStreakReads({ attendedCount: 3, occurrenceCount: 5 });

      await deleteFirstOccurrence({});

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 3 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(getSeriesStreakRequests()).toHaveLength(1);
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("reads the streak once instead of applying an unusable one", async () => {
      renderCalendar({ attendanceStreak: initialStreak });
      answerStreakReads({ attendedCount: 3, occurrenceCount: 5 });

      await editFirstOccurrence({
        attendanceStreak: { attendedCount: "2" },
        attendanceStreakNextRefreshAt: null,
      });

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 3 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(getSeriesStreakRequests()).toHaveLength(1);
    });
  });

  describe("attendance streak when an occurrence finishes", () => {
    const initialStreak = { attendedCount: 4, occurrenceCount: 5 };
    const streakEndpoint = "/api/tribes/matematica-pro/events/attendance-streak";
    const laterOccurrence = createOccurrence({
      endsAt: "2026-05-20T19:00:00.000Z",
      eventId: OTHER_EVENT_ID,
      startsAt: "2026-05-20T18:00:00.000Z",
      title: "Encuentro abierto",
    });

    function getNextEventRegion() {
      return screen.getByRole("region", { name: "Próximo evento" });
    }

    function getStreakRequests() {
      return (global.fetch as Mock).mock.calls.filter(([url]) => url === streakEndpoint);
    }

    async function advanceMinutes(minuteCount: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(minuteCount * 60_000);
      });
    }

    beforeEach(() => {
      // Two minutes before the first occurrence (18:00-19:00 UTC) ends.
      vi.setSystemTime(new Date("2026-05-06T18:58:00.000Z"));
    });

    it("asks for the streak once when the running occurrence ends", async () => {
      renderCalendar({
        attendanceStreak: initialStreak,
        events: [occurrence, laterOccurrence],
      });
      mockJsonResponse({
        attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        attendanceStreakNextRefreshAt: null,
      });

      await advanceMinutes(1);
      expect(getStreakRequests()).toHaveLength(0);

      await advanceMinutes(1);

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 5 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(getStreakRequests()).toHaveLength(1);
      expect(getStreakRequests()[0][1]).toEqual(
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );

      await advanceMinutes(5);

      expect(getStreakRequests()).toHaveLength(1);
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("keeps the streak on screen when the refresh fails", async () => {
      const { toast } = vi.mocked(await import("beez-ui"), true);
      renderCalendar({
        attendanceStreak: initialStreak,
        events: [occurrence, laterOccurrence],
      });
      mockJsonResponse({ message: "No pudimos actualizar tu racha." }, false);

      await advanceMinutes(2);

      await waitFor(() => expect(getStreakRequests()).toHaveLength(1));
      expect(
        within(getNextEventRegion()).getByText("Fuiste a 4 de los últimos 5 encuentros 🔥")
      ).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("ignores an unusable streak in the refresh response", async () => {
      renderCalendar({
        attendanceStreak: initialStreak,
        events: [occurrence, laterOccurrence],
      });
      mockJsonResponse({ attendanceStreak: { attendedCount: -1, occurrenceCount: 5 } });

      await advanceMinutes(2);

      await waitFor(() => expect(getStreakRequests()).toHaveLength(1));
      expect(
        within(getNextEventRegion()).getByText("Fuiste a 4 de los últimos 5 encuentros 🔥")
      ).toBeInTheDocument();
    });

    it("cancels a pending refresh when the calendar unmounts", async () => {
      (global.fetch as Mock).mockImplementationOnce(() => new Promise(() => undefined));
      const { unmount } = renderCalendar({
        attendanceStreak: initialStreak,
        events: [occurrence, laterOccurrence],
      });

      await advanceMinutes(2);
      await waitFor(() => expect(getStreakRequests()).toHaveLength(1));
      const signal = getStreakRequests()[0][1].signal as AbortSignal;

      unmount();

      expect(signal.aborted).toBe(true);
    });

    it("asks for the streak once when the occurrence ended between the server snapshot and the first client tick", async () => {
      // The server computed the streak at 18:58; the occurrence ended at
      // 19:00 and the client clock starts at 19:01.
      vi.setSystemTime(new Date("2026-05-06T19:01:00.000Z"));
      mockJsonResponse({
        attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        attendanceStreakNextRefreshAt: null,
      });
      renderCalendar({
        attendanceStreak: initialStreak,
        attendanceStreakComputedAt: "2026-05-06T18:58:00.000Z",
        events: [occurrence, laterOccurrence],
      });

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 5 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(getStreakRequests()).toHaveLength(1);

      await advanceMinutes(5);

      expect(getStreakRequests()).toHaveLength(1);
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("does not ask for the streak when the occurrence ended before the server snapshot", async () => {
      vi.setSystemTime(new Date("2026-05-06T19:03:00.000Z"));
      renderCalendar({
        attendanceStreak: initialStreak,
        attendanceStreakComputedAt: "2026-05-06T19:01:00.000Z",
        events: [occurrence, laterOccurrence],
      });

      await advanceMinutes(5);

      expect(getStreakRequests()).toHaveLength(0);
    });

    it("does not ask for the streak on the first client tick without a usable server snapshot", async () => {
      vi.setSystemTime(new Date("2026-05-06T19:01:00.000Z"));
      renderCalendar({
        attendanceStreak: initialStreak,
        attendanceStreakComputedAt: "no es una fecha",
        events: [occurrence, laterOccurrence],
      });

      await advanceMinutes(5);

      expect(getStreakRequests()).toHaveLength(0);
    });

    it("does not ask for the streak when no occurrence ends", async () => {
      renderCalendar({ attendanceStreak: initialStreak, events: [laterOccurrence] });

      await advanceMinutes(5);

      expect(getStreakRequests()).toHaveLength(0);
    });

    it("asks for the streak when an occurrence outside the visible month ends", async () => {
      // The workshop started last month and is still running, so the month
      // listing (matched by start) leaves it out; the server hands its end.
      mockJsonResponse({
        attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        attendanceStreakNextRefreshAt: "2026-05-06T19:30:00.000Z",
      });
      renderCalendar({
        attendanceStreak: initialStreak,
        attendanceStreakNextRefreshAt: "2026-05-06T19:00:00.000Z",
        events: [laterOccurrence],
      });

      await advanceMinutes(1);
      expect(getStreakRequests()).toHaveLength(0);

      await advanceMinutes(1);

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 5 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(getStreakRequests()).toHaveLength(1);

      // The refresh returned the following end, which is watched in turn.
      mockJsonResponse({
        attendanceStreak: { attendedCount: 3, occurrenceCount: 5 },
        attendanceStreakNextRefreshAt: null,
      });
      await advanceMinutes(30);

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 3 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(getStreakRequests()).toHaveLength(2);

      await advanceMinutes(60);

      expect(getStreakRequests()).toHaveLength(2);
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("asks for the streak once when the next refresh instant is also a visible end", async () => {
      mockJsonResponse({
        attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        attendanceStreakNextRefreshAt: null,
      });
      renderCalendar({
        attendanceStreak: initialStreak,
        attendanceStreakNextRefreshAt: "2026-05-06T19:00:00.000Z",
        events: [occurrence, laterOccurrence],
      });

      await advanceMinutes(2);

      expect(
        await within(getNextEventRegion()).findByText(
          "Fuiste a 5 de los últimos 5 encuentros 🔥"
        )
      ).toBeInTheDocument();
      expect(getStreakRequests()).toHaveLength(1);

      // The refresh omitted a new instant: the one already passed is kept
      // and never fires again.
      await advanceMinutes(5);

      expect(getStreakRequests()).toHaveLength(1);
    });

    it("ignores an unusable next refresh instant", async () => {
      renderCalendar({
        attendanceStreak: initialStreak,
        attendanceStreakNextRefreshAt: "mañana",
        events: [laterOccurrence],
      });

      await advanceMinutes(5);

      expect(getStreakRequests()).toHaveLength(0);
    });

    describe("next refresh instant returned by a series mutation", () => {
      const renewedStreakText = "Fuiste a 5 de los últimos 5 encuentros 🔥";

      /**
       * Creates a workshop that started last month and ends today, so the
       * visible month (matched by start) does not list it and only the
       * instant returned by the creation can make the calendar watch its end.
       */
      async function createRunningWorkshop(responseBody: Record<string, unknown>) {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        await user.click(screen.getByRole("button", { name: "Crear evento" }));
        fireEvent.change(screen.getByLabelText("Título"), {
          target: { value: "Taller intensivo" },
        });
        fireEvent.change(screen.getByLabelText("Fecha"), {
          target: { value: "2026-04-29" },
        });
        fireEvent.change(screen.getByLabelText("Hora de inicio"), {
          target: { value: "15:00" },
        });
        mockJsonResponse({
          event: createEventDto(),
          message: "Evento creado.",
          occurrences: [],
          ...responseBody,
        });
        await user.click(screen.getByRole("button", { name: "Guardar evento" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      }

      it("adopts the recomputed instant and asks for the streak when it arrives", async () => {
        renderCalendar({
          attendanceStreak: initialStreak,
          attendanceStreakNextRefreshAt: laterOccurrence.endsAt,
          events: [laterOccurrence],
        });

        await createRunningWorkshop({
          attendanceStreak: initialStreak,
          attendanceStreakNextRefreshAt: "2026-05-06T19:30:00.000Z",
        });
        mockJsonResponse({
          attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
          attendanceStreakNextRefreshAt: laterOccurrence.endsAt,
        });

        await advanceMinutes(20);
        expect(getStreakRequests()).toHaveLength(0);

        await advanceMinutes(15);

        expect(
          await within(getNextEventRegion()).findByText(renewedStreakText)
        ).toBeInTheDocument();
        expect(getStreakRequests()).toHaveLength(1);
        expect(router.refresh).not.toHaveBeenCalled();
      });

      /**
       * Answers every streak read with the renewed streak and an instant
       * still ahead; the mutation consumes the response queued by
       * `createRunningWorkshop`.
       */
      function answerStreakReadsWithRenewedStreak() {
        (global.fetch as Mock).mockImplementation(async (url: string) =>
          url === streakEndpoint
            ? {
                json: async () => ({
                  attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
                  attendanceStreakNextRefreshAt: laterOccurrence.endsAt,
                }),
                ok: true,
              }
            : Promise.reject(new Error(`Unexpected request to ${url}`))
        );
      }

      it("reads the streak and its instant right away when the mutation response omits the instant", async () => {
        renderCalendar({
          attendanceStreak: initialStreak,
          attendanceStreakNextRefreshAt: "2026-05-06T19:30:00.000Z",
          events: [laterOccurrence],
        });
        answerStreakReadsWithRenewedStreak();

        await createRunningWorkshop({ attendanceStreak: initialStreak });

        expect(
          await within(getNextEventRegion()).findByText(renewedStreakText)
        ).toBeInTheDocument();
        expect(getStreakRequests()).toHaveLength(1);

        // The instant the read returned replaced the rendered one.
        await advanceMinutes(35);

        expect(getStreakRequests()).toHaveLength(1);
      });

      it("reads the streak right away instead of applying an unusable instant", async () => {
        renderCalendar({
          attendanceStreak: initialStreak,
          attendanceStreakNextRefreshAt: "2026-05-06T19:30:00.000Z",
          events: [laterOccurrence],
        });
        answerStreakReadsWithRenewedStreak();

        await createRunningWorkshop({
          attendanceStreak: initialStreak,
          attendanceStreakNextRefreshAt: "mañana",
        });

        expect(
          await within(getNextEventRegion()).findByText(renewedStreakText)
        ).toBeInTheDocument();
        expect(getStreakRequests()).toHaveLength(1);
      });
    });

    describe("while a series mutation is in flight", () => {
      type JsonResponse = { json: () => Promise<Record<string, unknown>>; ok: boolean };

      const staleStreak = { attendedCount: 5, occurrenceCount: 5 };
      const committedStreak = { attendedCount: 2, occurrenceCount: 5 };
      const mutatedOccurrence: TribeEventOccurrenceResult = {
        ...laterOccurrence,
        seriesEndsAt: laterOccurrence.endsAt,
      };
      const closingOccurrence = createOccurrence({
        endsAt: "2026-05-27T19:00:00.000Z",
        eventId: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
        startsAt: "2026-05-27T18:00:00.000Z",
        title: "Cierre de mes",
      });

      /**
       * Models the database behind the routes: a streak read answers with
       * the pre-mutation streak until the held save commits, and with the
       * committed one afterwards.
       */
      function holdSave() {
        let isCommitted = false;
        let resolveSave: (response: JsonResponse) => void = () => undefined;
        const pendingSave = new Promise<JsonResponse>((resolve) => {
          resolveSave = resolve;
        });

        (global.fetch as Mock).mockImplementation(async (url: string) => {
          if (url === streakEndpoint) {
            return {
              json: async () => ({
                attendanceStreak: isCommitted ? committedStreak : staleStreak,
              }),
              ok: true,
            };
          }

          return pendingSave;
        });

        return {
          commitSave: async () => {
            isCommitted = true;
            await act(async () => {
              resolveSave({
                json: async () => ({
                  attendanceStreak: committedStreak,
                  event: createEventDto(),
                  message: "Evento actualizado.",
                  occurrences: [{ ...mutatedOccurrence, title: "Encuentro renovado" }],
                }),
                ok: true,
              });
              await pendingSave;
            });
          },
          rejectSave: async () => {
            await act(async () => {
              resolveSave({
                json: async () => ({ message: "No pudimos guardar el evento." }),
                ok: false,
              });
              await pendingSave;
            });
          },
        };
      }

      async function startSlowSave() {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        renderCalendar({
          attendanceStreak: initialStreak,
          events: [occurrence, mutatedOccurrence, closingOccurrence],
        });
        await user.click(screen.getByRole("button", { name: /15:00\s*Encuentro abierto/ }));
        await user.click(screen.getByRole("button", { name: "Editar" }));
        fireEvent.change(screen.getByLabelText("Título"), {
          target: { value: "Encuentro renovado" },
        });
        await user.click(screen.getByRole("button", { name: "Guardar evento" }));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

        return user;
      }

      it("defers a finish refresh until the save commits and keeps the committed streak", async () => {
        const slowSave = holdSave();
        await startSlowSave();

        await advanceMinutes(2);
        expect(getStreakRequests()).toHaveLength(0);

        await slowSave.commitSave();

        await waitFor(() => expect(getStreakRequests()).toHaveLength(1));
        expect(
          await within(getNextEventRegion()).findByText(
            "Fuiste a 2 de los últimos 5 encuentros 🔥"
          )
        ).toBeInTheDocument();
        expect(
          within(getNextEventRegion()).queryByText("Fuiste a 5 de los últimos 5 encuentros 🔥")
        ).not.toBeInTheDocument();
        expect(router.refresh).not.toHaveBeenCalled();
      });

      it("runs the deferred finish refresh when the save is rejected", async () => {
        const slowSave = holdSave();
        const user = await startSlowSave();

        await advanceMinutes(2);
        expect(getStreakRequests()).toHaveLength(0);

        await slowSave.rejectSave();
        await user.keyboard("{Escape}");

        await waitFor(() => expect(getStreakRequests()).toHaveLength(1));
        expect(
          await within(getNextEventRegion()).findByText(
            "Fuiste a 5 de los últimos 5 encuentros 🔥"
          )
        ).toBeInTheDocument();
      });
    });

    describe("while a finish refresh is in flight", () => {
      type JsonResponse = { json: () => Promise<Record<string, unknown>>; ok: boolean };

      const finishedStreakText = "Fuiste a 5 de los últimos 5 encuentros 🔥";
      const mutationStreakText = "Fuiste a 2 de los últimos 5 encuentros 🔥";
      // Mutated by the tests; its series ends with its single occurrence so
      // the edit form opens with a valid end date.
      const mutatedOccurrence: TribeEventOccurrenceResult = {
        ...laterOccurrence,
        seriesEndsAt: laterOccurrence.endsAt,
      };
      // Keeps a "next event" (where the streak renders) after a deletion.
      const closingOccurrence = createOccurrence({
        endsAt: "2026-05-27T19:00:00.000Z",
        eventId: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
        startsAt: "2026-05-27T18:00:00.000Z",
        title: "Cierre de mes",
      });

      /**
       * Routes the streak read to a response the test resolves by hand and
       * every other request to the next queued mutation response, so a
       * mutation can start and settle while the finish refresh is pending.
       */
      function holdStreakRefresh() {
        let resolveRefresh: (response: JsonResponse) => void = () => undefined;
        const pendingRefresh = new Promise<JsonResponse>((resolve) => {
          resolveRefresh = resolve;
        });
        const mutationResponses: Array<() => Promise<JsonResponse>> = [];

        (global.fetch as Mock).mockImplementation((url: string) => {
          if (url === streakEndpoint) {
            return pendingRefresh;
          }

          const nextMutationResponse = mutationResponses.shift();

          return nextMutationResponse
            ? nextMutationResponse()
            : Promise.reject(new Error(`Unexpected request to ${url}`));
        });

        return {
          queueMutationFailure: () => {
            mutationResponses.push(() => Promise.reject(new TypeError("Failed to fetch")));
          },
          queueMutationResponse: (body: Record<string, unknown>, ok = true) => {
            mutationResponses.push(async () => ({ json: async () => body, ok }));
          },
          resolveRefresh: async (body: Record<string, unknown>) => {
            await act(async () => {
              resolveRefresh({ json: async () => body, ok: true });
              await pendingRefresh;
            });
          },
        };
      }

      async function startFinishRefresh() {
        renderCalendar({
          attendanceStreak: initialStreak,
          events: [occurrence, mutatedOccurrence, closingOccurrence],
        });

        await advanceMinutes(2);
        await waitFor(() => expect(getStreakRequests()).toHaveLength(1));
      }

      async function waitForMutationToast() {
        const { toast } = vi.mocked(await import("beez-ui"), true);

        await waitFor(() =>
          expect(toast.error.mock.calls.length + toast.success.mock.calls.length).toBe(1)
        );
      }

      /**
       * A rejected mutation leaves its dialog open, which hides the rest of
       * the page from the accessibility tree, so close every open dialog.
       */
      async function closeOpenDialogs(user: ReturnType<typeof userEvent.setup>) {
        const maximumDialogDepth = 3;

        for (let depth = 0; depth < maximumDialogDepth; depth += 1) {
          const openDialogCount =
            screen.queryAllByRole("dialog").length + screen.queryAllByRole("alertdialog").length;

          if (openDialogCount === 0) {
            return;
          }

          await user.keyboard("{Escape}");
        }
      }

      async function submitLaterOccurrenceEdit() {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        await user.click(screen.getByRole("button", { name: /15:00\s*Encuentro abierto/ }));
        await user.click(screen.getByRole("button", { name: "Editar" }));
        fireEvent.change(screen.getByLabelText("Título"), {
          target: { value: "Encuentro renovado" },
        });
        await user.click(screen.getByRole("button", { name: "Guardar evento" }));
        await waitForMutationToast();
        await closeOpenDialogs(user);
      }

      async function submitLaterOccurrenceDeletion() {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        await user.click(screen.getByRole("button", { name: /15:00\s*Encuentro abierto/ }));
        await user.click(screen.getByRole("button", { name: "Eliminar" }));
        await user.click(
          within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar" })
        );
        await waitForMutationToast();
        await closeOpenDialogs(user);
      }

      it("applies the refresh when a save is rejected meanwhile", async () => {
        const streakRefresh = holdStreakRefresh();
        await startFinishRefresh();
        streakRefresh.queueMutationResponse({ message: "No pudimos guardar el evento." }, false);

        await submitLaterOccurrenceEdit();
        await streakRefresh.resolveRefresh({
          attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        });

        expect(
          await within(getNextEventRegion()).findByText(finishedStreakText)
        ).toBeInTheDocument();
      });

      it("applies the refresh when a save fails on the network meanwhile", async () => {
        const streakRefresh = holdStreakRefresh();
        await startFinishRefresh();
        streakRefresh.queueMutationFailure();

        await submitLaterOccurrenceEdit();
        await streakRefresh.resolveRefresh({
          attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        });

        expect(
          await within(getNextEventRegion()).findByText(finishedStreakText)
        ).toBeInTheDocument();
      });

      it("keeps the streak of a later successful save over the earlier refresh", async () => {
        const streakRefresh = holdStreakRefresh();
        await startFinishRefresh();
        streakRefresh.queueMutationResponse({
          attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
          attendanceStreakNextRefreshAt: null,
          event: createEventDto(),
          message: "Evento actualizado.",
          occurrences: [{ ...mutatedOccurrence, title: "Encuentro renovado" }],
        });

        await submitLaterOccurrenceEdit();
        expect(
          await within(getNextEventRegion()).findByText(mutationStreakText)
        ).toBeInTheDocument();
        await streakRefresh.resolveRefresh({
          attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        });

        expect(within(getNextEventRegion()).getByText(mutationStreakText)).toBeInTheDocument();
        expect(
          within(getNextEventRegion()).queryByText(finishedStreakText)
        ).not.toBeInTheDocument();
      });

      it("applies the refresh when a deletion is rejected meanwhile", async () => {
        const streakRefresh = holdStreakRefresh();
        await startFinishRefresh();
        streakRefresh.queueMutationResponse({ message: "No pudimos eliminar el evento." }, false);

        await submitLaterOccurrenceDeletion();
        await streakRefresh.resolveRefresh({
          attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        });

        expect(
          await within(getNextEventRegion()).findByText(finishedStreakText)
        ).toBeInTheDocument();
      });

      it("keeps the streak of a later successful deletion over the earlier refresh", async () => {
        const streakRefresh = holdStreakRefresh();
        await startFinishRefresh();
        streakRefresh.queueMutationResponse({
          attendanceStreak: { attendedCount: 2, occurrenceCount: 5 },
          attendanceStreakNextRefreshAt: null,
          message: "Evento eliminado.",
        });

        await submitLaterOccurrenceDeletion();
        expect(
          await within(getNextEventRegion()).findByText(mutationStreakText)
        ).toBeInTheDocument();
        await streakRefresh.resolveRefresh({
          attendanceStreak: { attendedCount: 5, occurrenceCount: 5 },
        });

        expect(within(getNextEventRegion()).getByText(mutationStreakText)).toBeInTheDocument();
        expect(
          within(getNextEventRegion()).queryByText(finishedStreakText)
        ).not.toBeInTheDocument();
      });
    });
  });

  it("shows the endpoint message when saving fails", async () => {
    const { toast } = vi.mocked(await import("beez-ui"), true);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Clase nueva" },
    });
    fireEvent.change(screen.getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "15:00" },
    });
    mockJsonResponse({ message: "No tenés permisos para gestionar eventos." }, false);
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No tenés permisos para gestionar eventos.")
    );
    expect(screen.getByRole("dialog", { name: "Nuevo evento" })).toBeInTheDocument();
  });

  it("treats an unusable save response as a failure with the safe fallback copy", async () => {
    const { toast } = vi.mocked(await import("beez-ui"), true);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Clase nueva" },
    });
    fireEvent.change(screen.getByLabelText("Fecha"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "15:00" },
    });
    // A 2xx whose body breaks the public contract must not patch the calendar
    // nor surface whatever text it carries.
    mockJsonResponse({
      event: createEventDto(),
      message: "Evento creado.",
      occurrences: [{ ...occurrence, startsAt: "raw-db-value", title: "Clase nueva" }],
    });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No pudimos guardar el evento."));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Clase nueva/ })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nuevo evento" })).toBeInTheDocument();
  });

  it("ignores an unusable attendance response and keeps the previous answer", async () => {
    const { toast } = vi.mocked(await import("beez-ui"), true);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: /15:00\s*Clase abierta/ }));
    mockJsonResponse({
      attendance: { goingCount: "3", viewerStatus: "going" },
      message: "Respuesta guardada.",
    });
    await user.click(screen.getByRole("button", { name: "Voy" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No pudimos guardar tu respuesta.")
    );
    expect(screen.getByRole("button", { name: "Voy" })).toHaveAttribute("aria-pressed", "false");
    expect(within(screen.getByRole("dialog")).getByText("2 van")).toBeInTheDocument();
  });
});

describe("TribeEventsCalendar server render", () => {
  it("ships both views so CSS can pick the layout before hydration", async () => {
    const { renderToString } = await import("react-dom/server");

    const html = renderToString(
      <RouterProvider>
        <TribeEventsCalendar
          events={[createOccurrence()]}
          month={MAY}
          tribeSlug="matematica-pro"
          viewerPermissions={{ canManageEvents: false }}
        />
      </RouterProvider>
    );

    expect(html).toContain('aria-label="Calendario mensual de eventos"');
    expect(html).toContain('aria-label="Lista de eventos"');
    // Each pre-hydration wrapper keeps the base element next to its modifier.
    expect(html).toContain(
      'class="TribeEventsCalendar__autoView TribeEventsCalendar__autoView--calendar"'
    );
    expect(html).toContain(
      'class="TribeEventsCalendar__autoView TribeEventsCalendar__autoView--list"'
    );
  });

  it("links the today shortcut to the bare route before hydration", async () => {
    const { renderToString } = await import("react-dom/server");

    const html = renderToString(
      <RouterProvider>
        <TribeEventsCalendar
          events={[createOccurrence()]}
          month={MAY}
          tribeSlug="matematica-pro"
          viewerPermissions={{ canManageEvents: false }}
        />
      </RouterProvider>
    );

    // Without a clock the server cannot know the viewer's "today", so the
    // link leaves the month to the route, which defaults to the current one.
    expect(html).toMatch(/href="\/matematica-pro\/eventos"[^>]*>Hoy</);
  });

  it("holds back the Google Calendar shortcut until the occurrence phase is known", async () => {
    const { renderToString } = await import("react-dom/server");

    const html = renderToString(
      <RouterProvider>
        <TribeEventsCalendar
          events={[createOccurrence()]}
          month={MAY}
          tribeSlug="matematica-pro"
          viewerPermissions={{ canManageEvents: false }}
        />
      </RouterProvider>
    );

    // Without a clock the server cannot tell a finished occurrence apart, so
    // the shortcut limited to unfinished events must not ship in the HTML.
    expect(html).toContain("Clase abierta");
    expect(html).not.toContain("Agregar a Google Calendar");
    expect(html).not.toContain("calendar.google.com");
  });

  it("keeps a single view once hydrated on the client", () => {
    renderCalendar();

    expect(
      screen.getByRole("table", { name: "Calendario mensual de eventos" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Lista de eventos" })
    ).not.toBeInTheDocument();
  });
});
