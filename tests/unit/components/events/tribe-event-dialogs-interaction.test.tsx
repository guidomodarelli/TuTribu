import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeEventAttendanceOptions } from "@/components/events/tribe-event-attendance-options";
import { TribeEventCalendarFeedDialog } from "@/components/events/tribe-event-calendar-feed-dialog";
import { TribeEventConversation } from "@/components/events/tribe-event-conversation";
import { TribeEventDeleteDialog } from "@/components/events/tribe-event-delete-dialog";
import { TribeEventDetailDialog } from "@/components/events/tribe-event-detail-dialog";
import { TribeEventFormDialog } from "@/components/events/tribe-event-form-dialog";
import { TribeEventLessonConversionDialog } from "@/components/events/tribe-event-lesson-conversion-dialog";
import { TribeEventOccurrenceExceptionDialog } from "@/components/events/tribe-event-occurrence-exception-dialog";
import { TribeEventPostEventFormDialog } from "@/components/events/tribe-event-post-event-form-dialog";
import { TribeEventProposalFormDialog } from "@/components/events/tribe-event-proposal-form-dialog";
import { TribeEventProposalsPanel } from "@/components/events/tribe-event-proposals-panel";
import type {
  TribeEventOccurrenceResult,
  TribeEventProposalResult,
} from "@/src/modules/events/application/results/tribe-event-result";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const COMMENT_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const STARTS_AT = "2026-05-06T18:00:00.000Z";
const ENDS_AT = "2026-05-06T19:00:00.000Z";

function createOccurrence(
  overrides: Partial<TribeEventOccurrenceResult> = {}
): TribeEventOccurrenceResult {
  return {
    attendance: {
      goingCount: 1,
      goingPreview: [],
      maybeCount: 0,
      viewerStatus: null,
      viewerWaitlistPosition: null,
      waitlistedCount: 0,
    },
    capacity: null,
    description: null,
    endsAt: ENDS_AT,
    eventId: EVENT_ID,
    eventType: "live",
    exception: null,
    meetingUrl: null,
    occurrenceKey: `${EVENT_ID}@${STARTS_AT}`,
    originalStartsAt: STARTS_AT,
    recurrenceFrequency: "weekly",
    recurrenceRule: "FREQ=WEEKLY",
    recurrenceUntil: null,
    seriesEndsAt: ENDS_AT,
    seriesStartsAt: STARTS_AT,
    startsAt: STARTS_AT,
    title: "Clase abierta",
    ...overrides,
  };
}

function createProposal(overrides: Partial<TribeEventProposalResult> = {}): TribeEventProposalResult {
  return {
    createdAt: "2026-05-01T12:00:00.000Z",
    description: null,
    durationMinutes: 60,
    eventId: null,
    eventType: "live",
    id: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
    proposerName: "Ana",
    reviewNote: null,
    reviewedAt: null,
    startsAt: STARTS_AT,
    status: "pending",
    title: "Picnic",
    ...overrides,
  };
}

const detailDialogCallbacks = {
  onClose: vi.fn(),
  onCopyLink: vi.fn(),
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onSetAttendance: vi.fn(),
};

describe("event dialogs keep their content while they animate out", () => {
  it("keeps the detail of the closed occurrence until the dialog leaves", async () => {
    const view = render(
      <TribeEventDetailDialog
        {...detailDialogCallbacks}
        canManageEvents={false}
        isPast={false}
        isSavingAttendance={false}
        occurrence={createOccurrence()}
        tribeSlug="matematica-pro"
        viewerTimeZone={null}
      />
    );

    expect(screen.getByRole("dialog", { name: "Clase abierta" })).toBeInTheDocument();

    view.rerender(
      <TribeEventDetailDialog
        {...detailDialogCallbacks}
        canManageEvents={false}
        isPast={false}
        isSavingAttendance={false}
        occurrence={null}
        tribeSlug="matematica-pro"
        viewerTimeZone={null}
      />
    );

    // While closing (already hidden from assistive technology), the dialog
    // still shows what the member was reading instead of an empty frame.
    const closingDialog = screen.getByRole("dialog", { hidden: true });

    expect(closingDialog).toHaveTextContent("Clase abierta");
    expect(closingDialog).toHaveTextContent("Miércoles 6 de mayo");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the delete confirmation copy until the alert dialog leaves", async () => {
    const callbacks = { onCancel: vi.fn(), onConfirm: vi.fn() };
    const view = render(
      <TribeEventDeleteDialog {...callbacks} isDeleting={false} occurrence={createOccurrence()} />
    );

    view.rerender(<TribeEventDeleteDialog {...callbacks} isDeleting={false} occurrence={null} />);

    expect(
      screen.getByText(/Se van a eliminar todas las repeticiones de «Clase abierta»/)
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("keeps the lesson result instead of the loading copy while the conversion closes", async () => {
    const dialogProps = {
      defaultDescription: "",
      defaultTitle: "Clase abierta · 6 may",
      isSubmitting: false,
      onClose: vi.fn(),
      onRetry: vi.fn(),
      onSubmit: vi.fn(),
    };
    const view = render(
      <TribeEventLessonConversionDialog
        {...dialogProps}
        convertedLesson={{
          isExisting: false,
          lesson: {
            courseId: "66666666-cccc-4666-8666-666666666601",
            href: "/matematica-pro/cursos/lecciones/1",
            id: "66666666-eeee-4666-8666-666666666601",
            title: "Clase abierta · 6 may",
          },
          message: "Lección creada.",
        }}
        isOpen
        targetsState={{ courses: [], status: "loaded" }}
      />
    );

    // The container closes the dialog and resets the conversion in one update.
    view.rerender(
      <TribeEventLessonConversionDialog
        {...dialogProps}
        convertedLesson={null}
        isOpen={false}
        targetsState={{ status: "idle" }}
      />
    );

    expect(screen.getByText("La lección ya está en el curso.")).toBeInTheDocument();
    expect(screen.queryByText("Cargando cursos…")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("event forms point validation at the field to fix", () => {
  it("marks, describes and focuses an invalid capacity, and clears it on edit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TribeEventFormDialog
        editingOccurrence={null}
        isOpen
        isSaving={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Nuevo evento" });

    await user.type(within(dialog).getByLabelText("Título"), "Clase abierta");
    await user.type(within(dialog).getByLabelText("Fecha"), "2026-05-06");
    await user.type(within(dialog).getByLabelText("Hora de inicio"), "15:00");
    await user.type(within(dialog).getByLabelText("Cupo máximo (opcional)"), "0");
    await user.click(within(dialog).getByRole("button", { name: "Guardar evento" }));

    const capacityField = within(dialog).getByLabelText("Cupo máximo (opcional)");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Ingresá un cupo entre 1 y 10000, o dejalo vacío para no limitarlo."
    );
    expect(capacityField).toHaveAttribute("aria-invalid", "true");
    expect(capacityField).toHaveFocus();
    expect(capacityField).toHaveAccessibleDescription(
      /Ingresá un cupo entre 1 y 10000.*Si se completa, las nuevas respuestas quedan en lista de espera\./
    );

    await user.type(capacityField, "5");

    expect(capacityField).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument());
  });

  it("reports a missing proposal title in Spanish and focuses it", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TribeEventProposalFormDialog
        isOpen
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Proponer un encuentro" });

    await user.click(within(dialog).getByRole("button", { name: "Enviar propuesta" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Completá el título, la fecha y la hora de inicio."
    );
    expect(within(dialog).getByLabelText("Título")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText("Título")).toHaveFocus();

    await user.type(within(dialog).getByLabelText("Título"), "Picnic");
    await user.click(within(dialog).getByRole("button", { name: "Enviar propuesta" }));

    // The next missing field takes over.
    expect(within(dialog).getByLabelText("Fecha")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText("Fecha")).toHaveFocus();
    expect(within(dialog).getByLabelText("Título")).not.toHaveAttribute("aria-invalid");
  });

  it("points a moved date without start time at the start time field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TribeEventOccurrenceExceptionDialog
        isSaving={false}
        mode="moved"
        occurrence={createOccurrence()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Mover esta fecha" });

    await user.clear(within(dialog).getByLabelText("Hora de inicio"));
    await user.click(within(dialog).getByRole("button", { name: "Mover esta fecha" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("Hora de inicio")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText("Hora de inicio")).toHaveFocus();
    expect(within(dialog).getByLabelText("Hora de inicio")).toHaveAccessibleDescription(
      "Elegí la nueva fecha y la hora de inicio."
    );
  });

  it("focuses new material rows, the link to fix, and the add button after a removal", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TribeEventPostEventFormDialog
        initialPostEvent={null}
        isOpen
        isSaving={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Grabación y materiales" });

    await user.click(within(dialog).getByRole("button", { name: "Agregar material" }));

    const titleField = within(dialog).getByRole("textbox", { name: "Nombre del material 1" });

    await waitFor(() => expect(titleField).toHaveFocus());

    await user.type(titleField, "Slides");
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    const urlField = within(dialog).getByRole("textbox", { name: "Link del material 1" });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(urlField).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(urlField).toHaveFocus());

    await user.click(within(dialog).getByRole("button", { name: "Quitar material 1" }));

    await waitFor(() =>
      expect(within(dialog).queryByRole("textbox", { name: "Nombre del material 1" })).not.toBeInTheDocument()
    );
    expect(within(dialog).getByRole("button", { name: "Agregar material" })).toHaveFocus();
  });
});

describe("event panels keep keyboard focus through inline steps", () => {
  it("moves focus into the regenerate confirmation and back when it is cancelled", async () => {
    const user = userEvent.setup();

    render(
      <TribeEventCalendarFeedDialog
        feedUrl={null}
        isOpen
        isSubmitting={false}
        loadState={{
          status: "loaded",
          subscription: {
            createdAt: "2026-05-01T12:00:00.000Z",
            id: "9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e",
            lastUsedAt: null,
          },
        }}
        onClose={vi.fn()}
        onCopyLink={vi.fn()}
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Suscribirme al calendario" });

    await user.click(within(dialog).getByRole("button", { name: "Regenerar link" }));

    const cancelButton = await within(dialog).findByRole("button", { name: "Cancelar" });

    await waitFor(() => expect(cancelButton).toHaveFocus());

    await user.click(cancelButton);

    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Regenerar link" })).toHaveFocus()
    );
  });

  it("focuses the rejection note and returns to «Rechazar» when the manager goes back", async () => {
    const user = userEvent.setup();

    render(
      <TribeEventProposalsPanel
        canManageEvents
        isOpen
        isSubmitting={false}
        loadState={{ canReviewProposals: true, proposals: [createProposal()], status: "loaded" }}
        onClose={vi.fn()}
        onReject={vi.fn(async () => true)}
        onRetry={vi.fn()}
        onReview={vi.fn()}
        onWithdraw={vi.fn()}
      />
    );

    const panel = screen.getByRole("dialog", { name: "Propuestas de la tribu" });

    await user.click(within(panel).getByRole("button", { name: "Rechazar" }));

    await waitFor(() =>
      expect(
        within(panel).getByRole("textbox", { name: "Nota para quien la propuso (opcional)" })
      ).toHaveFocus()
    );

    await user.click(within(panel).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(within(panel).getByRole("button", { name: "Rechazar" })).toHaveFocus());
  });

  it("focuses the safe answer of the delete confirmation and returns to the trash button", async () => {
    const user = userEvent.setup();

    render(
      <TribeEventConversation
        deletingCommentIds={new Set()}
        isFinished
        isSubmitting={false}
        loadState={{
          canComment: true,
          comments: [
            {
              authorImageUrl: null,
              authorName: "Ana",
              canDelete: true,
              content: "¡Gracias!",
              createdAt: "2026-05-06T20:00:00.000Z",
              id: COMMENT_ID,
            },
          ],
          status: "loaded",
        }}
        onCreateComment={vi.fn(async () => true)}
        onDeleteComment={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Eliminar comentario de Ana" }));

    expect(screen.getByRole("button", { name: "No" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "No" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Eliminar comentario de Ana" })).toHaveFocus()
    );
  });

  it("marks a comment being deleted as busy", () => {
    render(
      <TribeEventConversation
        deletingCommentIds={new Set([COMMENT_ID])}
        isFinished
        isSubmitting={false}
        loadState={{
          canComment: true,
          comments: [
            {
              authorImageUrl: null,
              authorName: "Ana",
              canDelete: true,
              content: "¡Gracias!",
              createdAt: "2026-05-06T20:00:00.000Z",
              id: COMMENT_ID,
            },
          ],
          status: "loaded",
        }}
        onCreateComment={vi.fn(async () => true)}
        onDeleteComment={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole("listitem")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Eliminar comentario de Ana" })).toBeDisabled();
  });
});

describe("attendance options", () => {
  it("reports the group as busy while an answer is saving", () => {
    const view = render(
      <TribeEventAttendanceOptions
        isSaving
        legend="¿Vas a participar?"
        viewerStatus="going"
        onSelect={vi.fn()}
      />
    );

    const group = screen.getByRole("group", { name: "¿Vas a participar?" });

    expect(group).toHaveAttribute("aria-busy", "true");
    expect(within(group).getByRole("button", { name: "Voy" })).toHaveAttribute("aria-pressed", "true");

    view.rerender(
      <TribeEventAttendanceOptions
        isSaving={false}
        legend="¿Vas a participar?"
        viewerStatus="maybe"
        onSelect={vi.fn()}
      />
    );

    expect(group).toHaveAttribute("aria-busy", "false");
    expect(within(group).getByRole("button", { name: "Tal vez" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(group).getByRole("button", { name: "Voy" })).toHaveAttribute("aria-pressed", "false");
  });
});
