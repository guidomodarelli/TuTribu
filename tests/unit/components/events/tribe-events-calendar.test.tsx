import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe("TribeEventsCalendar", () => {
  const event = {
    description: "Repaso mensual",
    endsAt: "2026-05-06T19:00:00.000Z",
    id: "event-1",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    startsAt: "2026-05-06T18:00:00.000Z",
    title: "Clase abierta",
  };
  const nextMonthEvent = {
    description: "Planificación mensual",
    endsAt: "2026-06-10T19:00:00.000Z",
    id: "event-2",
    meetingUrl: null,
    startsAt: "2026-06-10T18:00:00.000Z",
    title: "Encuentro de junio",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders a monthly calendar table with events and navigation", () => {
    render(
      <TribeEventsCalendar
        events={[event]}
        month={{
          current: "2026-05",
          next: "2026-06",
          previous: "2026-04",
        }}
        tribeSlug="matematica-pro"
        viewerPermissions={{
          canManageEvents: true,
        }}
      />
    );

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
    expect(screen.getByText("Clase abierta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear evento" })).toBeInTheDocument();
  });

  it("switches to the event list table", async () => {
    const user = userEvent.setup();

    render(
      <TribeEventsCalendar
        events={[event]}
        month={{
          current: "2026-05",
          next: "2026-06",
          previous: "2026-04",
        }}
        tribeSlug="matematica-pro"
        viewerPermissions={{
          canManageEvents: true,
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Ver lista" }));

    const listTable = screen.getByRole("table", {
      name: "Lista de eventos",
    });

    expect(within(listTable).getByRole("columnheader", { name: "Evento" })).toBeInTheDocument();
    expect(within(listTable).getByRole("cell", { name: "Clase abierta" })).toBeInTheDocument();
  });

  it("updates visible events when the route month changes", () => {
    const { rerender } = render(
      <TribeEventsCalendar
        events={[event]}
        month={{
          current: "2026-05",
          next: "2026-06",
          previous: "2026-04",
        }}
        tribeSlug="matematica-pro"
        viewerPermissions={{
          canManageEvents: true,
        }}
      />
    );

    rerender(
      <TribeEventsCalendar
        events={[nextMonthEvent]}
        month={{
          current: "2026-06",
          next: "2026-07",
          previous: "2026-05",
        }}
        tribeSlug="matematica-pro"
        viewerPermissions={{
          canManageEvents: true,
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Junio 2026" })).toBeInTheDocument();
    expect(screen.getByText("Encuentro de junio")).toBeInTheDocument();
    expect(screen.queryByText("Clase abierta")).not.toBeInTheDocument();
  });

  it("hides management actions when the viewer cannot manage events", () => {
    render(
      <TribeEventsCalendar
        events={[event]}
        month={{
          current: "2026-05",
          next: "2026-06",
          previous: "2026-04",
        }}
        tribeSlug="matematica-pro"
        viewerPermissions={{
          canManageEvents: false,
        }}
      />
    );

    expect(screen.queryByRole("button", { name: "Crear evento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });

  it("creates an event through the tribe event endpoint", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        event,
        message: "Evento creado.",
      }),
    });
    const user = userEvent.setup();

    render(
      <TribeEventsCalendar
        events={[]}
        month={{
          current: "2026-05",
          next: "2026-06",
          previous: "2026-04",
        }}
        tribeSlug="matematica-pro"
        viewerPermissions={{
          canManageEvents: true,
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    await user.type(screen.getByLabelText("Título"), "Clase abierta");
    await user.type(screen.getByLabelText("Fecha"), "2026-05-06");
    await user.type(screen.getByLabelText("Hora de inicio"), "15:00");
    await user.type(screen.getByLabelText("Link digital"), "https://meet.google.com/abc-defg-hij");
    await user.click(screen.getByRole("button", { name: "Guardar evento" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/events",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain(
      "https://meet.google.com/abc-defg-hij"
    );
  });

  it("prevents duplicate event creation while the save request is pending", async () => {
    let resolveRequest: (value: {
      json: () => Promise<{
        event: typeof event;
        message: string;
      }>;
      ok: boolean;
    }) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    const user = userEvent.setup();

    render(
      <TribeEventsCalendar
        events={[]}
        month={{
          current: "2026-05",
          next: "2026-06",
          previous: "2026-04",
        }}
        tribeSlug="matematica-pro"
        viewerPermissions={{
          canManageEvents: true,
        }}
      />
    );

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
        event,
        message: "Evento creado.",
      }),
      ok: true,
    });
  });
});
