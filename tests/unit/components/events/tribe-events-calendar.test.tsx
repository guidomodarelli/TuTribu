import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

// Preserve the existing Sonner double to isolate its timers and global notification store.
jest.mock("beez-ui", () => ({
  ...jest.requireActual("beez-ui"),
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OTHER_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const MAY = {
  current: "2026-05",
  next: "2026-06",
  previous: "2026-04",
};

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  const startsAt = overrides.startsAt ?? "2026-05-06T18:00:00.000Z";
  const eventId = overrides.eventId ?? EVENT_ID;

  return {
    attendance: { goingCount: 2, viewerStatus: null },
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
    />
  );
}

function mockJsonResponse(body: Record<string, unknown>, ok = true) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
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
    jest.clearAllMocks();
    global.fetch = jest.fn();
    // The fixtures live in May 2026; pin "now" before them so the occurrences
    // are upcoming (attendance enabled) regardless of the real date.
    jest
      .useFakeTimers({ advanceTimers: true })
      .setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
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
      expect.stringMatching(/\/matematica-pro\/eventos\?month=\d{4}-\d{2}/)
    );
    expect(
      screen.getByRole("table", { name: "Calendario mensual de eventos" })
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Lun" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15:00 Clase abierta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear evento" })).toBeInTheDocument();
  });

  it("switches to the event list table with attendance counts", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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

  it("groups the agenda by day, marks today and shows the viewer answer and recurrence", async () => {
    jest.setSystemTime(new Date("2026-05-06T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const weeklyOccurrence = createOccurrence({
      attendance: { goingCount: 4, viewerStatus: "going" },
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

  it("shows a quiet empty state when the month has no events", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar({ events: [] });

    expect(screen.getByText("No hay eventos este mes.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    expect(screen.queryByRole("region", { name: "Lista de eventos" })).not.toBeInTheDocument();
    expect(screen.getByText("No hay eventos este mes.")).toBeInTheDocument();
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
      screen.getByRole("button", { name: "15:00 Encuentro de junio" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Clase abierta")).not.toBeInTheDocument();
  });

  it("highlights the next event, today, and finished occurrences", async () => {
    jest.setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
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

  it("keeps every occurrence visible when browsing a month that is entirely past", async () => {
    jest.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    expect(screen.getByRole("button", { name: "Clase abierta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalizado/ })).not.toBeInTheDocument();
  });

  it("records the viewer attendance from the next event block without opening the detail", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar();

    const nextEvent = await screen.findByRole("region", { name: "Próximo evento" });
    const goingButton = within(nextEvent).getByRole("button", { name: "Voy" });

    expect(goingButton).toHaveAttribute("aria-pressed", "false");

    mockJsonResponse({
      attendance: { goingCount: 3, viewerStatus: "going" },
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
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar({ viewerPermissions: { canManageEvents: false } });

    await user.click(screen.getByRole("button", { name: "15:00 Clase abierta" }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(within(dialog).getByText("Repaso mensual")).toBeInTheDocument();
    expect(within(dialog).getByText("2 personas van")).toBeInTheDocument();
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

  it("records and clears the viewer attendance from the detail", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: "15:00 Clase abierta" }));
    mockJsonResponse({
      attendance: { goingCount: 3, viewerStatus: "going" },
      message: "Respuesta guardada.",
    });
    await user.click(screen.getByRole("button", { name: "Voy" }));

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/attendance`,
      expect.objectContaining({ method: "PUT" })
    );
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      occurrenceStartsAt: "2026-05-06T18:00:00.000Z",
      status: "going",
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Voy" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.getByText("3 personas van")).toBeInTheDocument();

    mockJsonResponse({
      attendance: { goingCount: 2, viewerStatus: null },
      message: "Respuesta eliminada.",
    });
    await user.click(screen.getByRole("button", { name: "Voy" }));

    expect(global.fetch).toHaveBeenLastCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/attendance?occurrence=${encodeURIComponent(
        "2026-05-06T18:00:00.000Z"
      )}`,
      expect.objectContaining({ method: "DELETE" })
    );
    await waitFor(() => expect(screen.getByText("2 personas van")).toBeInTheDocument());
  });

  it("creates an event through the tribe event endpoint and shows it without reloading", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const createdOccurrence = createOccurrence({
      attendance: { goingCount: 0, viewerStatus: null },
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
      event: {},
      message: "Evento creado.",
      occurrences: [createdOccurrence],
    });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/events?month=2026-05",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      description: "",
      endsAt: "2026-05-20T19:00:00.000Z",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      recurrenceFrequency: "none",
      recurrenceUntil: "",
      startsAt: "2026-05-20T18:00:00.000Z",
      title: "Clase nueva",
    });
    expect(
      await screen.findByRole("button", { name: "15:00 Clase nueva" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("suggests an end time one hour after the start without overriding an explicit one", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar({ events: [] });

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "15:00" },
    });

    expect(screen.getByLabelText("Hora de fin")).toHaveValue("16:00");

    fireEvent.change(screen.getByLabelText("Hora de fin"), {
      target: { value: "17:30" },
    });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), {
      target: { value: "16:00" },
    });

    expect(screen.getByLabelText("Hora de fin")).toHaveValue("17:30");
  });

  it("lists the tapped day's events under the grid", async () => {
    jest.setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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
    jest.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence({
          attendance: { goingCount: 1, viewerStatus: null },
          description: null,
          endsAt: null,
          meetingUrl: null,
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "15:00 Clase abierta" }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(within(dialog).getByText("Finalizado")).toBeInTheDocument();
    expect(within(dialog).getByText("Sin link de reunión")).toBeInTheDocument();
    expect(within(dialog).queryByText("Descripción")).not.toBeInTheDocument();
    expect(within(dialog).getByText("1 persona fue")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Voy" })).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Descargar .ics" })
    ).toBeInTheDocument();
  });

  it("shows the recurrence next to the schedule in the detail header", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence({
          recurrenceFrequency: "weekly",
          recurrenceRule: "FREQ=WEEKLY",
          recurrenceUntil: "2026-06-30T23:59:00.000Z",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "15:00 Clase abierta" }));

    const dialog = screen.getByRole("dialog", { name: "Clase abierta" });

    expect(
      within(dialog).getByText(/Miércoles 6 de mayo · 15:00 - 16:00 · Todas las semanas hasta el 30 jun/)
    ).toBeInTheDocument();
  });

  it("validates the schedule inline before sending the form", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
    mockJsonResponse({ event: {}, message: "Evento creado.", occurrences: [] });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
      endsAt: "2026-05-21T04:00:00.000Z",
      startsAt: "2026-05-21T02:00:00.000Z",
    });
    // Let the save settle (form closes) so its state updates land inside the test.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("prevents duplicate event creation while the save request is pending", async () => {
    let resolveRequest: (value: {
      json: () => Promise<{ occurrences: TribeEventOccurrenceResult[] }>;
      ok: boolean;
    }) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
      json: async () => ({ occurrences: [occurrence] }),
      ok: true,
    });

    expect(
      await screen.findByRole("button", { name: "15:00 Clase abierta" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits an event from the detail and keeps the attendance of existing slots", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: "15:00 Clase abierta" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByRole("dialog", { name: "Editar evento" })).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("Clase abierta");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-05-06");
    expect(screen.getByLabelText("Hora de inicio")).toHaveValue("15:00");
    expect(screen.getByLabelText("Hora de fin")).toHaveValue("16:00");

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Clase cerrada" },
    });
    mockJsonResponse({
      event: {},
      message: "Evento actualizado.",
      occurrences: [
        createOccurrence({
          attendance: { goingCount: 0, viewerStatus: null },
          title: "Clase cerrada",
        }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}?month=2026-05`,
      expect.objectContaining({ method: "PATCH" })
    );
    expect(await screen.findByRole("button", { name: "15:00 Clase cerrada" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "15:00 Clase cerrada" }));

    expect(screen.getByText("2 personas van")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting an event", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: "15:00 Clase abierta" }));
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    const confirmation = screen.getByRole("alertdialog", { name: "¿Eliminar este evento?" });

    await user.click(within(confirmation).getByRole("button", { name: "Cancelar" }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "15:00 Clase abierta" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "15:00 Clase abierta" }));
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
      expect(screen.queryByRole("button", { name: "15:00 Clase abierta" })).not.toBeInTheDocument()
    );
  });

  it("shows the endpoint message when saving fails", async () => {
    const { toast } = jest.requireMock("beez-ui") as { toast: { error: jest.Mock } };
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
});

describe("TribeEventsCalendar server render", () => {
  it("ships both views so CSS can pick the layout before hydration", async () => {
    const { renderToString } = await import("react-dom/server");

    const html = renderToString(
      <TribeEventsCalendar
        events={[createOccurrence()]}
        month={MAY}
        tribeSlug="matematica-pro"
        viewerPermissions={{ canManageEvents: false }}
      />
    );

    expect(html).toContain('aria-label="Calendario mensual de eventos"');
    expect(html).toContain('aria-label="Lista de eventos"');
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
