import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...(await vi.importActual<typeof import("beez-ui")>("beez-ui")),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const SOCIAL_EVENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const PROPOSAL_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const MAY = { current: "2026-05", next: "2026-06", previous: "2026-04" };
const MANAGER = { canManageEvents: true, canProposeEvents: false };
const MEMBER = { canManageEvents: false, canProposeEvents: true };

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  const originalStartsAt = overrides.originalStartsAt ?? overrides.startsAt ?? "2026-05-14T21:00:00.000Z";
  const eventId = overrides.eventId ?? EVENT_ID;

  return {
    attendance: {
      goingCount: 0,
      goingPreview: [],
      maybeCount: 0,
      viewerStatus: null,
      viewerWaitlistPosition: null,
      waitlistedCount: 0,
    },
    capacity: null,
    description: null,
    endsAt: null,
    eventId,
    eventType: "workshop",
    exception: null,
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    occurrenceKey: `${eventId}@${originalStartsAt}`,
    originalStartsAt,
    recurrenceFrequency: "weekly",
    recurrenceRule: "FREQ=WEEKLY",
    recurrenceUntil: null,
    seriesEndsAt: null,
    seriesStartsAt: "2026-05-07T21:00:00.000Z",
    startsAt: originalStartsAt,
    title: "Taller semanal",
    ...overrides,
  };
}

const router = {
  back: vi.fn(),
  bfcacheId: "tribe-events-phase-test",
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
      viewerPermissions={MANAGER}
      {...props}
    />,
    { wrapper: RouterProvider }
  );
}

function mockJsonResponse(body: Record<string, unknown>, ok = true) {
  (global.fetch as Mock).mockResolvedValueOnce({ json: async () => body, ok });
}

describe("TribeEventsCalendar types, date exceptions, and proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    window.history.replaceState(null, "", "/matematica-pro/eventos");
    vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(
      new Date("2026-05-01T12:00:00.000Z")
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks every occurrence with its type label, not only its color", () => {
    renderCalendar();

    const pill = screen.getByRole("button", { name: /Taller\s*18:00\s*Taller semanal/ });

    expect(pill).toHaveAttribute("data-event-type", "workshop");
  });

  it("filters by type on the client and mirrors the selection in the URL", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence(),
        createOccurrence({
          eventId: SOCIAL_EVENT_ID,
          eventType: "social",
          startsAt: "2026-05-15T21:00:00.000Z",
          title: "After de la tribu",
        }),
      ],
    });

    const filters = screen.getByRole("group", { name: "Filtrar por tipo de evento" });

    await user.click(within(filters).getByRole("button", { name: "Social" }));

    expect(within(filters).getByRole("button", { name: "Social" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("button", { name: /Taller semanal/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /After de la tribu/ })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.getAll("type")).toEqual(["social"]);
    expect(screen.getByRole("link", { name: "Mes siguiente" })).toHaveAttribute(
      "href",
      "/matematica-pro/eventos?month=2026-06&type=social"
    );
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(within(filters).getByRole("button", { name: "Todos" }));

    expect(screen.getByRole("button", { name: /Taller semanal/ })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.getAll("type")).toEqual([]);
  });

  it("starts from the validated type filter of the page", () => {
    renderCalendar({
      events: [createOccurrence()],
      initialEventTypes: ["social"],
    });

    expect(screen.queryByRole("button", { name: /Taller semanal/ })).not.toBeInTheDocument();
    expect(screen.getByText("No hay eventos de los tipos elegidos este mes.")).toBeInTheDocument();
  });

  it("shows a cancelled date struck through, without answers, and never as the next event", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence({ exception: { kind: "cancelled", reason: "Feriado" } }),
        createOccurrence({ startsAt: "2026-05-21T21:00:00.000Z" }),
      ],
      viewerPermissions: MEMBER,
    });

    const nextEvent = screen.getByRole("region", { name: "Próximo evento" });

    expect(within(nextEvent).getByText(/jueves 21 de mayo/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /18:00\s*Taller semanal\s*Cancelado/ }));

    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText("Cancelado")).toBeInTheDocument();
    expect(within(dialog).getByText("Motivo: Feriado")).toBeInTheDocument();
    expect(within(dialog).getByText("Esta fecha fue cancelada: no recibe respuestas.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Voy" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: /Abrir link de reunión/ })).not.toBeInTheDocument();
  });

  it("says where a moved date comes from and answers with its original start", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({
      events: [
        createOccurrence({
          exception: { kind: "moved", reason: null },
          originalStartsAt: "2026-05-14T21:00:00.000Z",
          startsAt: "2026-05-15T21:00:00.000Z",
        }),
      ],
      viewerPermissions: MEMBER,
    });

    await user.click(screen.getByRole("button", { name: /18:00\s*Taller semanal/ }));

    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText("Movido desde el jueves 14")).toBeInTheDocument();

    mockJsonResponse({
      attendance: {
        goingCount: 1,
        goingPreview: [],
        maybeCount: 0,
        viewerStatus: "going",
        viewerWaitlistPosition: null,
        waitlistedCount: 0,
      },
      message: "Respuesta guardada.",
    });
    await user.click(within(dialog).getByRole("button", { name: "Voy" }));

    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toEqual({
      occurrenceStartsAt: "2026-05-14T21:00:00.000Z",
      status: "going",
    });
  });

  it("lets managers cancel only this date and patches the calendar without a route refresh", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: /18:00\s*Taller semanal/ }));

    const dialog = screen.getByRole("dialog");
    const dateActions = within(dialog).getByRole("region", { name: "Esta fecha" });
    const seriesActions = within(dialog).getByRole("region", { name: "Toda la serie" });

    expect(within(seriesActions).getByRole("button", { name: "Editar serie" })).toBeInTheDocument();
    expect(within(seriesActions).getByRole("button", { name: "Eliminar serie" })).toBeInTheDocument();

    await user.click(within(dateActions).getByRole("button", { name: "Cancelar esta fecha" }));

    const cancelDialog = screen.getByRole("dialog", { name: "Cancelar esta fecha" });

    expect(
      within(cancelDialog).getByText(/Solo se cancela la fecha del jueves 14 de mayo/)
    ).toBeInTheDocument();
    await user.type(within(cancelDialog).getByLabelText("Motivo (opcional)"), "Feriado");
    mockJsonResponse({
      message: "Fecha cancelada.",
      occurrences: [createOccurrence({ exception: { kind: "cancelled", reason: "Feriado" } })],
    });
    await user.click(within(cancelDialog).getByRole("button", { name: "Cancelar esta fecha" }));

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/exceptions?month=2026-05`,
      expect.objectContaining({ method: "PUT" })
    );
    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toEqual({
      kind: "cancelled",
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      reason: "Feriado",
    });
    // The detail stays open on the same occurrence (stable key) with its new state.
    expect(await within(dialog).findByText("Cancelado")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Restaurar fecha" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Voy" })).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("moves a date with a validated schedule and restores it later", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const moved = createOccurrence({
      exception: { kind: "moved", reason: null },
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      startsAt: "2026-05-15T22:00:00.000Z",
    });

    renderCalendar();

    await user.click(screen.getByRole("button", { name: /18:00\s*Taller semanal/ }));
    await user.click(screen.getByRole("button", { name: "Mover esta fecha" }));

    const moveDialog = screen.getByRole("dialog", { name: "Mover esta fecha" });
    const dateInput = within(moveDialog).getByLabelText("Nueva fecha");

    await user.clear(dateInput);
    await user.type(dateInput, "2026-05-15");
    await user.clear(within(moveDialog).getByLabelText("Hora de inicio"));
    await user.type(within(moveDialog).getByLabelText("Hora de inicio"), "19:00");
    await user.type(within(moveDialog).getByLabelText("Hora de fin (opcional)"), "18:00");
    await user.click(within(moveDialog).getByRole("button", { name: "Mover esta fecha" }));

    expect(within(moveDialog).getByRole("alert")).toHaveTextContent(
      "La hora de fin debe ser posterior al inicio."
    );
    expect(global.fetch).not.toHaveBeenCalled();

    await user.clear(within(moveDialog).getByLabelText("Hora de fin (opcional)"));
    mockJsonResponse({ message: "Fecha movida.", occurrences: [moved] });
    await user.click(within(moveDialog).getByRole("button", { name: "Mover esta fecha" }));

    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toMatchObject({
      kind: "moved",
      newEndsAt: null,
      newStartsAt: "2026-05-15T22:00:00.000Z",
      originalStartsAt: "2026-05-14T21:00:00.000Z",
    });

    const detail = screen.getByRole("dialog");

    expect(await within(detail).findByText("Movido desde el jueves 14")).toBeInTheDocument();
    mockJsonResponse({ message: "Fecha restaurada.", occurrences: [createOccurrence()] });
    await user.click(within(detail).getByRole("button", { name: "Restaurar fecha" }));

    // A date change can move the streak and its next refresh, so the calendar
    // also reads the streak again once the change settles.
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/matematica-pro/events/${EVENT_ID}/exceptions?occurrence=${encodeURIComponent(
        "2026-05-14T21:00:00.000Z"
      )}&month=2026-05`,
      expect.objectContaining({ method: "DELETE" })
    );
    await waitFor(() =>
      expect(within(detail).queryByText("Movido desde el jueves 14")).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/events/attendance-streak",
        expect.objectContaining({ cache: "no-store" })
      )
    );
  });

  it("moves an overnight date keeping its next-day end and duration", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // 23:00–01:00 in Buenos Aires: it starts on May 13 and ends on May 14.
    const overnight = createOccurrence({
      endsAt: "2026-05-14T04:00:00.000Z",
      originalStartsAt: "2026-05-14T02:00:00.000Z",
      seriesEndsAt: "2026-05-07T04:00:00.000Z",
      seriesStartsAt: "2026-05-07T02:00:00.000Z",
      startsAt: "2026-05-14T02:00:00.000Z",
    });

    renderCalendar({ events: [overnight] });

    await user.click(screen.getByRole("button", { name: /23:00\s*Taller semanal/ }));
    await user.click(screen.getByRole("button", { name: "Mover esta fecha" }));

    const moveDialog = screen.getByRole("dialog", { name: "Mover esta fecha" });
    const dateInput = within(moveDialog).getByLabelText("Nueva fecha");

    expect(dateInput).toHaveValue("2026-05-13");
    expect(within(moveDialog).getByLabelText("Hora de inicio")).toHaveValue("23:00");
    expect(within(moveDialog).getByLabelText("Hora de fin (opcional)")).toHaveValue("01:00");
    expect(within(moveDialog).getByRole("checkbox", { name: "Termina otro día" })).toBeChecked();
    expect(within(moveDialog).getByLabelText("Fecha de fin")).toHaveValue("2026-05-14");

    // Moving the start carries the suggested end along, one duration later.
    await user.clear(dateInput);
    await user.type(dateInput, "2026-05-14");

    expect(within(moveDialog).getByLabelText("Fecha de fin")).toHaveValue("2026-05-15");
    expect(within(moveDialog).getByLabelText("Hora de fin (opcional)")).toHaveValue("01:00");

    mockJsonResponse({ message: "Fecha movida.", occurrences: [overnight] });
    await user.click(within(moveDialog).getByRole("button", { name: "Mover esta fecha" }));

    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toMatchObject({
      kind: "moved",
      newEndsAt: "2026-05-15T04:00:00.000Z",
      newStartsAt: "2026-05-15T02:00:00.000Z",
      originalStartsAt: "2026-05-14T02:00:00.000Z",
    });
  });

  it("keeps a manually edited end and shows an error when it falls before the new start", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const overnight = createOccurrence({
      endsAt: "2026-05-14T04:00:00.000Z",
      originalStartsAt: "2026-05-14T02:00:00.000Z",
      startsAt: "2026-05-14T02:00:00.000Z",
    });

    renderCalendar({ events: [overnight] });

    await user.click(screen.getByRole("button", { name: /23:00\s*Taller semanal/ }));
    await user.click(screen.getByRole("button", { name: "Mover esta fecha" }));

    const moveDialog = screen.getByRole("dialog", { name: "Mover esta fecha" });
    const endDateInput = within(moveDialog).getByLabelText("Fecha de fin");

    await user.clear(endDateInput);
    await user.type(endDateInput, "2026-05-16");
    await user.clear(within(moveDialog).getByLabelText("Nueva fecha"));
    await user.type(within(moveDialog).getByLabelText("Nueva fecha"), "2026-05-17");

    // The manager chose the end, so it no longer follows the start.
    expect(within(moveDialog).getByLabelText("Fecha de fin")).toHaveValue("2026-05-16");

    await user.click(within(moveDialog).getByRole("button", { name: "Mover esta fecha" }));

    expect(within(moveDialog).getByRole("alert")).toHaveTextContent(
      "La hora de fin debe ser posterior al inicio."
    );
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(within(moveDialog).getByRole("checkbox", { name: "Termina otro día" }));

    expect(within(moveDialog).queryByLabelText("Fecha de fin")).not.toBeInTheDocument();
    await user.clear(within(moveDialog).getByLabelText("Hora de fin (opcional)"));
    await user.type(within(moveDialog).getByLabelText("Hora de fin (opcional)"), "23:30");
    mockJsonResponse({ message: "Fecha movida.", occurrences: [overnight] });
    await user.click(within(moveDialog).getByRole("button", { name: "Mover esta fecha" }));

    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toMatchObject({
      newEndsAt: "2026-05-18T02:30:00.000Z",
      newStartsAt: "2026-05-18T02:00:00.000Z",
    });
  });

  it("lets a member propose a meeting from the toolbar and from the empty month", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderCalendar({ events: [], viewerPermissions: MEMBER });

    expect(screen.getAllByRole("button", { name: "Proponer un encuentro" })).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "Proponer un encuentro" })[0]);

    const form = screen.getByRole("dialog", { name: "Proponer un encuentro" });

    await user.type(within(form).getByLabelText("Título"), "Taller de repaso");
    await user.type(within(form).getByLabelText("Fecha"), "2026-05-20");
    await user.type(within(form).getByLabelText("Hora de inicio"), "18:00");
    mockJsonResponse({
      message: "Propuesta enviada. Quienes gestionan eventos la van a revisar.",
      proposal: {
        createdAt: "2026-05-01T12:00:00.000Z",
        description: null,
        durationMinutes: 60,
        eventId: null,
        eventType: "live",
        id: PROPOSAL_ID,
        proposerName: "Ana",
        reviewNote: null,
        reviewedAt: null,
        startsAt: "2026-05-20T21:00:00.000Z",
        status: "pending",
        title: "Taller de repaso",
      },
    });
    await user.click(within(form).getByRole("button", { name: "Enviar propuesta" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/events/proposals",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse((global.fetch as Mock).mock.calls[0][1].body)).toEqual({
      description: "",
      durationMinutes: 60,
      eventType: "live",
      startsAt: "2026-05-20T21:00:00.000Z",
      title: "Taller de repaso",
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Proponer un encuentro" })).not.toBeInTheDocument()
    );
  });

  it("lets managers review a proposal, approve it prefilled, and see the new event", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const proposal = {
      createdAt: "2026-05-01T12:00:00.000Z",
      description: "Repasamos parciales",
      durationMinutes: 90,
      eventId: null,
      eventType: "workshop",
      id: PROPOSAL_ID,
      proposerName: "Ana",
      reviewNote: null,
      reviewedAt: null,
      startsAt: "2026-05-20T21:00:00.000Z",
      status: "pending",
      title: "Taller de repaso",
    };

    renderCalendar({ events: [], pendingProposalCount: 1 });

    mockJsonResponse({ canReviewProposals: true, pendingCount: 1, proposals: [proposal] });
    await user.click(screen.getByRole("button", { name: "Propuestas (1)" }));

    const panel = screen.getByRole("dialog", { name: "Propuestas de la tribu" });

    expect(await within(panel).findByText("Propuesta por Ana")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Revisar y aprobar" }));

    const form = screen.getByRole("dialog", { name: "Aprobar propuesta" });

    expect(within(form).getByLabelText("Título")).toHaveValue("Taller de repaso");
    expect(within(form).getByLabelText("Fecha")).toHaveValue("2026-05-20");
    expect(within(form).getByLabelText("Hora de inicio")).toHaveValue("18:00");
    expect(within(form).getByLabelText("Hora de fin")).toHaveValue("19:30");
    expect(within(form).getByLabelText("Descripción")).toHaveValue("Repasamos parciales");

    mockJsonResponse({
      event: {
        capacity: null,
        description: "Repasamos parciales",
        endsAt: "2026-05-20T22:30:00.000Z",
        eventType: "workshop",
        id: SOCIAL_EVENT_ID,
        meetingUrl: null,
        recurrenceFrequency: "none",
        recurrenceRule: null,
        recurrenceUntil: null,
        startsAt: "2026-05-20T21:00:00.000Z",
        title: "Taller de repaso",
      },
      message: "Propuesta aprobada: el evento ya está en el calendario.",
      occurrences: [
        createOccurrence({
          endsAt: "2026-05-20T22:30:00.000Z",
          eventId: SOCIAL_EVENT_ID,
          recurrenceFrequency: "none",
          recurrenceRule: null,
          startsAt: "2026-05-20T21:00:00.000Z",
          title: "Taller de repaso",
        }),
      ],
      proposal: { ...proposal, eventId: SOCIAL_EVENT_ID, reviewedAt: "2026-05-01T12:00:00.000Z", status: "approved" },
    });
    await user.click(within(form).getByRole("button", { name: "Aprobar y publicar" }));

    expect(global.fetch).toHaveBeenLastCalledWith(
      `/api/tribes/matematica-pro/events/proposals/${PROPOSAL_ID}/approval?month=2026-05`,
      expect.objectContaining({ method: "POST" })
    );
    expect(
      await screen.findByRole("button", { name: /18:00\s*Taller de repaso/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Propuestas \(/ })).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("keeps the uncapped pending total on the badge when the queue is capped and decrements it on approval", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pendingTotal = 73;
    const cappedQueueSize = 50;
    const queue = Array.from({ length: cappedQueueSize }, (_, index) => ({
      createdAt: "2026-05-01T12:00:00.000Z",
      description: null,
      durationMinutes: 60,
      eventId: null,
      eventType: "social",
      id: `3c4d5e6f-7a8b-4c9d-8e0f-${String(index).padStart(12, "0")}`,
      proposerName: "Ana",
      reviewNote: null,
      reviewedAt: null,
      startsAt: "2026-05-20T21:00:00.000Z",
      status: "pending",
      title: `Propuesta ${index + 1}`,
    }));
    const [firstProposal] = queue;

    renderCalendar({ events: [], pendingProposalCount: pendingTotal });

    mockJsonResponse({ canReviewProposals: true, pendingCount: pendingTotal, proposals: queue });
    await user.click(screen.getByRole("button", { name: `Propuestas (${pendingTotal})` }));

    const panel = screen.getByRole("dialog", { name: "Propuestas de la tribu" });

    expect(await within(panel).findByText("Propuesta 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { hidden: true, name: `Propuestas (${pendingTotal})` })
    ).toBeInTheDocument();

    await user.click(within(panel).getAllByRole("button", { name: "Revisar y aprobar" })[0]);

    const form = screen.getByRole("dialog", { name: "Aprobar propuesta" });

    mockJsonResponse({
      event: {
        capacity: null,
        description: null,
        endsAt: "2026-05-20T22:00:00.000Z",
        eventType: "social",
        id: SOCIAL_EVENT_ID,
        meetingUrl: null,
        recurrenceFrequency: "none",
        recurrenceRule: null,
        recurrenceUntil: null,
        startsAt: "2026-05-20T21:00:00.000Z",
        title: "Propuesta 1",
      },
      message: "Propuesta aprobada: el evento ya está en el calendario.",
      occurrences: [],
      proposal: {
        ...firstProposal,
        eventId: SOCIAL_EVENT_ID,
        reviewedAt: "2026-05-01T12:00:00.000Z",
        status: "approved",
      },
    });
    await user.click(within(form).getByRole("button", { name: "Aprobar y publicar" }));

    expect(
      await screen.findByRole("button", { hidden: true, name: `Propuestas (${pendingTotal - 1})` })
    ).toBeInTheDocument();
  });

  it("lets managers reject a proposal with a note", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const proposal = {
      createdAt: "2026-05-01T12:00:00.000Z",
      description: null,
      durationMinutes: 60,
      eventId: null,
      eventType: "social",
      id: PROPOSAL_ID,
      proposerName: "Ana",
      reviewNote: null,
      reviewedAt: null,
      startsAt: "2026-05-20T21:00:00.000Z",
      status: "pending",
      title: "After",
    };

    renderCalendar({ pendingProposalCount: 1 });

    mockJsonResponse({ canReviewProposals: true, pendingCount: 1, proposals: [proposal] });
    await user.click(screen.getByRole("button", { name: "Propuestas (1)" }));

    const panel = screen.getByRole("dialog", { name: "Propuestas de la tribu" });

    await user.click(await within(panel).findByRole("button", { name: "Rechazar" }));
    await user.type(
      within(panel).getByLabelText("Nota para quien la propuso (opcional)"),
      "Ya hay un after"
    );
    mockJsonResponse({
      message: "Propuesta rechazada.",
      proposal: { ...proposal, reviewNote: "Ya hay un after", reviewedAt: "2026-05-01T12:00:00.000Z", status: "rejected" },
    });
    await user.click(within(panel).getByRole("button", { name: "Confirmar rechazo" }));

    expect(JSON.parse((global.fetch as Mock).mock.calls[1][1].body)).toEqual({
      decision: "rejected",
      reviewNote: "Ya hay un after",
    });
    expect(await within(panel).findByText("No hay propuestas pendientes.")).toBeInTheDocument();
  });
});
