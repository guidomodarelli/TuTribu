"use client";

import { type ReactNode, useState } from "react";
import { CalendarPlusIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, LinkIcon } from "lucide-react";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "beez-ui";

import { TribeEventAttendanceOptions } from "@/components/events/tribe-event-attendance-options";
import { TribeEventAttendanceSummary } from "@/components/events/tribe-event-attendance-summary";
import { TribeEventTypeBadge } from "@/components/events/tribe-event-type-badge";
import { AnimatedCollapse } from "@/components/motion/animated-collapse";
import { PresenceSwap } from "@/components/motion/presence-swap";
import { buildTribeEventGoogleCalendarUrl } from "@/lib/events/tribe-event-calendar-links";
import {
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_COPY,
  formatMovedFromLabel,
  isOccurrenceCancelled,
} from "@/lib/events/tribe-event-occurrence-exception-copy";
import {
  formatBuenosAiresLongDate,
  formatBuenosAiresShortDate,
  formatBuenosAiresTimeRange,
} from "@/lib/date-time/buenos-aires-format";
import { formatViewerLocalTimeLabel } from "@/lib/date-time/viewer-local-time-format";
import { ROUTES } from "@/src/constants/routes";
import type {
  TribeEventAttendanceOption,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_RECURRENCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import { TRIBE_EVENT_RECURRENCE_FREQUENCY } from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventDetailDialogProps = {
  /**
   * Occurrence activity rendered by the container under the detail: the
   * post-event block (recording, materials, reactions) and the conversation.
   */
  activityPanel?: ReactNode;
  /**
   * Manager-only "Asistentes" tab content, rendered by the container (which
   * owns the report request). When null the dialog shows no tabs.
   */
  attendeesPanel?: ReactNode;
  canManageEvents: boolean;
  isPast: boolean;
  isSavingAttendance: boolean;
  isSavingException?: boolean;
  occurrence: TribeEventOccurrenceResult | null;
  /** "Cancelar esta fecha" (only this date of a series). */
  onCancelOccurrence?: (occurrence: TribeEventOccurrenceResult) => void;
  onClose: () => void;
  onCopyLink: (occurrence: TribeEventOccurrenceResult) => void;
  onDelete: (occurrence: TribeEventOccurrenceResult) => void;
  onEdit: (occurrence: TribeEventOccurrenceResult) => void;
  /** "Mover esta fecha" (only this date of a series). */
  onMoveOccurrence?: (occurrence: TribeEventOccurrenceResult) => void;
  /** "Restaurar fecha": removes the cancellation or move of this date. */
  onRestoreOccurrence?: (occurrence: TribeEventOccurrenceResult) => void;
  onSetAttendance: (
    occurrence: TribeEventOccurrenceResult,
    status: TribeEventAttendanceOption | null
  ) => void;
  /** Called when the manager opens (true) or leaves (false) "Asistentes". */
  onToggleAttendees?: (isOpen: boolean) => void;
  tribeSlug: string;
  /** Browser time zone, null before hydration. */
  viewerTimeZone: string | null;
};

/**
 * Occurrence view the dialog renders: the open props, or the last open props
 * while the dialog animates out.
 */
type RetainedDetailView = {
  activityPanel: ReactNode;
  attendeesPanel: ReactNode;
  isPast: boolean;
  occurrence: TribeEventOccurrenceResult;
};

type TribeEventDetailDialogBodyProps = Omit<
  TribeEventDetailDialogProps,
  "activityPanel" | "attendeesPanel" | "isPast" | "isSavingException" | "occurrence" | "onClose"
> & {
  isSavingException: boolean;
  view: RetainedDetailView;
};

const EVENT_ENDPOINT = {
  calendarPath: "/calendar",
  eventsPath: "/events",
  separator: "/",
} as const;
const LINK_ATTRIBUTE = {
  noreferrer: "noreferrer",
  targetBlank: "_blank",
} as const;
const BADGE_VARIANT = {
  destructive: "destructive",
  outline: "outline",
  secondary: "secondary",
} as const;
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantDestructive: "destructive",
  variantOutline: "outline",
  variantSecondary: "secondary",
} as const;
/**
 * Tabs of the manager view of the dialog.
 */
const DETAIL_TAB = {
  attendees: "attendees",
  detail: "detail",
} as const;
/**
 * Presence keys of the attendance area: the summary and the cancelled
 * notice cross-fade when a manager cancels or restores the date.
 */
const ATTENDANCE_PRESENCE_KEY = {
  cancelled: "cancelled",
  summary: "summary",
} as const;
const COPY = {
  attendanceHeading: "Asistencia",
  attendanceLegend: "¿Vas a participar?",
  attendeesTab: "Asistentes",
  cancelOccurrenceButton: "Cancelar esta fecha",
  cancelledNotice: "Esta fecha fue cancelada: no recibe respuestas.",
  deleteButton: "Eliminar",
  deleteSeriesButton: "Eliminar serie",
  editSeriesButton: "Editar serie",
  moveOccurrenceButton: "Mover esta fecha",
  occurrenceActionsHeading: "Esta fecha",
  reasonPrefix: "Motivo: ",
  restoreOccurrenceButton: "Restaurar fecha",
  seriesActionsHeading: "Toda la serie",
  descriptionHeading: "Descripción",
  detailTab: "Detalle",
  downloadIcs: "Descargar .ics",
  copyLink: "Copiar link",
  editButton: "Editar",
  googleCalendar: "Agregar a Google Calendar",
  linkOpen: "Abrir link de reunión",
  meetingLinkMissing: "Sin link de reunión",
  pastBadge: "Finalizado",
  recurrenceUntilPrefix: " hasta el ",
  scheduleSeparator: " · ",
} as const;

function buildCalendarDownloadUrl(tribeSlug: string, eventId: string): string {
  return (
    ROUTES.api.tribes +
    EVENT_ENDPOINT.separator +
    tribeSlug +
    EVENT_ENDPOINT.eventsPath +
    EVENT_ENDPOINT.separator +
    eventId +
    EVENT_ENDPOINT.calendarPath
  );
}

function formatRecurrence(occurrence: TribeEventOccurrenceResult): string | null {
  if (occurrence.recurrenceFrequency === TRIBE_EVENT_RECURRENCE_FREQUENCY.none) {
    return null;
  }

  const label = TRIBE_EVENT_RECURRENCE_LABEL[occurrence.recurrenceFrequency];

  return occurrence.recurrenceUntil
    ? label + COPY.recurrenceUntilPrefix + formatBuenosAiresShortDate(occurrence.recurrenceUntil)
    : label;
}

/**
 * Read-only view of one occurrence: schedule, description, meeting link,
 * attendance answer, calendar exports, and the manager actions.
 */
export function TribeEventDetailDialog({
  activityPanel = null,
  attendeesPanel = null,
  canManageEvents,
  isPast,
  isSavingAttendance,
  isSavingException = false,
  occurrence,
  onCancelOccurrence,
  onClose,
  onCopyLink,
  onDelete,
  onEdit,
  onMoveOccurrence,
  onRestoreOccurrence,
  onSetAttendance,
  onToggleAttendees,
  tribeSlug,
  viewerTimeZone,
}: TribeEventDetailDialogProps) {
  // The container clears `occurrence` (and the panels built from it) to
  // close the dialog, but the dialog keeps its content mounted while it
  // animates out. The last open view is retained so the closing dialog shows
  // what the member was reading instead of collapsing into an empty frame.
  const [retainedView, setRetainedView] = useState<RetainedDetailView | null>(null);

  if (occurrence !== null && retainedView?.occurrence !== occurrence) {
    setRetainedView({ activityPanel, attendeesPanel, isPast, occurrence });
  }

  const view: RetainedDetailView | null =
    occurrence !== null ? { activityPanel, attendeesPanel, isPast, occurrence } : retainedView;

  return (
    <Dialog
      open={occurrence !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className={styles.TribeEventDetailDialog}>
        {view ? (
          <TribeEventDetailDialogBody
            canManageEvents={canManageEvents}
            isSavingAttendance={isSavingAttendance}
            isSavingException={isSavingException}
            tribeSlug={tribeSlug}
            view={view}
            viewerTimeZone={viewerTimeZone}
            onCancelOccurrence={onCancelOccurrence}
            onCopyLink={onCopyLink}
            onDelete={onDelete}
            onEdit={onEdit}
            onMoveOccurrence={onMoveOccurrence}
            onRestoreOccurrence={onRestoreOccurrence}
            onSetAttendance={onSetAttendance}
            onToggleAttendees={onToggleAttendees}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Occurrence-dependent content of the dialog, rendered from the open props
 * or, while closing, from the retained view.
 */
function TribeEventDetailDialogBody({
  canManageEvents,
  isSavingAttendance,
  isSavingException,
  onCancelOccurrence,
  onCopyLink,
  onDelete,
  onEdit,
  onMoveOccurrence,
  onRestoreOccurrence,
  onSetAttendance,
  onToggleAttendees,
  tribeSlug,
  view,
  viewerTimeZone,
}: TribeEventDetailDialogBodyProps) {
  const { activityPanel, attendeesPanel, isPast, occurrence } = view;
  const localTimeLabel = formatViewerLocalTimeLabel(
    occurrence.startsAt,
    occurrence.endsAt,
    viewerTimeZone
  );
  const recurrenceText = formatRecurrence(occurrence);
  const isCancelled = isOccurrenceCancelled(occurrence);
  const isSeries = occurrence.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none;
  const movedFromLabel = formatMovedFromLabel(occurrence);
  const googleCalendarUrl = isCancelled ? null : buildTribeEventGoogleCalendarUrl(occurrence);
  const canAnswerAttendance = !isPast && !isCancelled;

  const renderSeriesManagerActions = (currentOccurrence: TribeEventOccurrenceResult) => (
    <DialogFooter className={styles.TribeEventDetailDialog__managerActions}>
      <section
        aria-label={COPY.occurrenceActionsHeading}
        className={styles.TribeEventDetailDialog__actionGroup}
      >
        <p className={styles.TribeEventDetailDialog__actionGroupHeading}>
          {COPY.occurrenceActionsHeading}
        </p>
        <div className={styles.TribeEventDetailDialog__actionGroupButtons}>
          {/* An ended date is frozen: the server refuses changing it (409). */}
          {currentOccurrence.exception && !isPast ? (
            <Button
              disabled={isSavingException}
              size={BUTTON_ATTRIBUTE.sizeSmall}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={() => onRestoreOccurrence?.(currentOccurrence)}
            >
              {COPY.restoreOccurrenceButton}
            </Button>
          ) : null}
          {isPast ? null : (
            <>
              <Button
                disabled={isSavingException}
                size={BUTTON_ATTRIBUTE.sizeSmall}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={BUTTON_ATTRIBUTE.variantOutline}
                onClick={() => onMoveOccurrence?.(currentOccurrence)}
              >
                {COPY.moveOccurrenceButton}
              </Button>
              {isCancelled ? null : (
                <Button
                  disabled={isSavingException}
                  size={BUTTON_ATTRIBUTE.sizeSmall}
                  type={BUTTON_ATTRIBUTE.typeButton}
                  variant={BUTTON_ATTRIBUTE.variantOutline}
                  onClick={() => onCancelOccurrence?.(currentOccurrence)}
                >
                  {COPY.cancelOccurrenceButton}
                </Button>
              )}
            </>
          )}
        </div>
      </section>
      <section
        aria-label={COPY.seriesActionsHeading}
        className={styles.TribeEventDetailDialog__actionGroup}
      >
        <p className={styles.TribeEventDetailDialog__actionGroupHeading}>
          {COPY.seriesActionsHeading}
        </p>
        <div className={styles.TribeEventDetailDialog__actionGroupButtons}>
          <Button
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantSecondary}
            onClick={() => onEdit(currentOccurrence)}
          >
            {COPY.editSeriesButton}
          </Button>
          <Button
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantDestructive}
            onClick={() => onDelete(currentOccurrence)}
          >
            {COPY.deleteSeriesButton}
          </Button>
        </div>
      </section>
    </DialogFooter>
  );

  const detailContent = (
    <>
      {movedFromLabel || occurrence.exception?.reason ? (
        <div className={styles.TribeEventDetailDialog__exception}>
          {movedFromLabel ? (
            <p className={styles.TribeEventDetailDialog__exceptionText}>{movedFromLabel}</p>
          ) : null}
          {occurrence.exception?.reason ? (
            <p className={styles.TribeEventDetailDialog__exceptionText}>
              {COPY.reasonPrefix}
              {occurrence.exception.reason}
            </p>
          ) : null}
        </div>
      ) : null}
      {occurrence.description ? (
        <dl className={styles.TribeEventDetailDialog__facts}>
          <div className={styles.TribeEventDetailDialog__fact}>
            <dt className={styles.TribeEventDetailDialog__factTerm}>{COPY.descriptionHeading}</dt>
            <dd className={styles.TribeEventDetailDialog__description}>
              {occurrence.description}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className={styles.TribeEventDetailDialog__links}>
        {isCancelled ? null : occurrence.meetingUrl ? (
          <Button asChild className={styles.TribeEventDetailDialog__primaryLink}>
            <a
              href={occurrence.meetingUrl}
              rel={LINK_ATTRIBUTE.noreferrer}
              target={LINK_ATTRIBUTE.targetBlank}
            >
              <ExternalLinkIcon aria-hidden />
              {COPY.linkOpen}
            </a>
          </Button>
        ) : (
          <p className={styles.TribeEventDetailDialog__missingLink}>
            <LinkIcon aria-hidden className={styles.TribeEventDetailDialog__missingLinkIcon} />
            {COPY.meetingLinkMissing}
          </p>
        )}
        {googleCalendarUrl ? (
          <Button
            asChild
            size={BUTTON_ATTRIBUTE.sizeSmall}
            variant={BUTTON_ATTRIBUTE.variantOutline}
          >
            <a
              href={googleCalendarUrl}
              rel={LINK_ATTRIBUTE.noreferrer}
              target={LINK_ATTRIBUTE.targetBlank}
            >
              <CalendarPlusIcon aria-hidden />
              {COPY.googleCalendar}
            </a>
          </Button>
        ) : null}
        <Button
          asChild
          size={BUTTON_ATTRIBUTE.sizeSmall}
          variant={BUTTON_ATTRIBUTE.variantOutline}
        >
          <a href={buildCalendarDownloadUrl(tribeSlug, occurrence.eventId)}>
            <DownloadIcon aria-hidden />
            {COPY.downloadIcs}
          </a>
        </Button>
        <Button
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          variant={BUTTON_ATTRIBUTE.variantOutline}
          onClick={() => onCopyLink(occurrence)}
        >
          <CopyIcon aria-hidden />
          {COPY.copyLink}
        </Button>
      </div>

      <section
        aria-label={COPY.attendanceHeading}
        className={styles.TribeEventDetailDialog__attendance}
      >
        <p className={styles.TribeEventDetailDialog__attendanceHeading}>
          {COPY.attendanceHeading}
        </p>
        <PresenceSwap
          presenceKey={
            isCancelled ? ATTENDANCE_PRESENCE_KEY.cancelled : ATTENDANCE_PRESENCE_KEY.summary
          }
        >
          {isCancelled ? (
            <p className={styles.TribeEventDetailDialog__cancelledNotice}>{COPY.cancelledNotice}</p>
          ) : (
            <TribeEventAttendanceSummary isPast={isPast} occurrence={occurrence} />
          )}
        </PresenceSwap>
        <AnimatedCollapse isOpen={canAnswerAttendance}>
          <div className={styles.TribeEventDetailDialog__attendanceActions}>
            <span className={styles.TribeEventDetailDialog__attendanceLegend}>
              {COPY.attendanceLegend}
            </span>
            <TribeEventAttendanceOptions
              isSaving={isSavingAttendance}
              legend={COPY.attendanceLegend}
              viewerStatus={occurrence.attendance.viewerStatus}
              onSelect={(status) => onSetAttendance(occurrence, status)}
            />
          </div>
        </AnimatedCollapse>
      </section>
      {activityPanel}
    </>
  );

  return (
    <>
      <DialogHeader>
        <div className={styles.TribeEventDetailDialog__titleRow}>
          <DialogTitle className={styles.TribeEventDetailDialog__title}>
            {occurrence.title}
          </DialogTitle>
          {isCancelled ? (
            <Badge variant={BADGE_VARIANT.destructive}>
              {TRIBE_EVENT_OCCURRENCE_EXCEPTION_COPY.cancelledBadge}
            </Badge>
          ) : null}
          {movedFromLabel ? (
            <Badge variant={BADGE_VARIANT.outline}>
              {TRIBE_EVENT_OCCURRENCE_EXCEPTION_COPY.movedBadge}
            </Badge>
          ) : null}
          {isPast && !isCancelled ? (
            <Badge variant={BADGE_VARIANT.secondary}>{COPY.pastBadge}</Badge>
          ) : null}
        </div>
        <TribeEventTypeBadge eventType={occurrence.eventType} />
        <DialogDescription>
          {formatBuenosAiresLongDate(occurrence.startsAt)}
          {COPY.scheduleSeparator}
          {formatBuenosAiresTimeRange(occurrence.startsAt, occurrence.endsAt)}
          {recurrenceText ? COPY.scheduleSeparator + recurrenceText : null}
        </DialogDescription>
        {localTimeLabel ? (
          <p className={styles.TribeEventDetailDialog__localTime}>{localTimeLabel}</p>
        ) : null}
      </DialogHeader>

      {attendeesPanel ? (
        <Tabs
          className={styles.TribeEventDetailDialog__tabs}
          defaultValue={DETAIL_TAB.detail}
          key={occurrence.occurrenceKey}
          onValueChange={(value) => onToggleAttendees?.(value === DETAIL_TAB.attendees)}
        >
          <TabsList>
            <TabsTrigger value={DETAIL_TAB.detail}>{COPY.detailTab}</TabsTrigger>
            <TabsTrigger value={DETAIL_TAB.attendees}>{COPY.attendeesTab}</TabsTrigger>
          </TabsList>
          <TabsContent
            className={styles.TribeEventDetailDialog__tabPanel}
            value={DETAIL_TAB.detail}
          >
            {detailContent}
          </TabsContent>
          <TabsContent value={DETAIL_TAB.attendees}>{attendeesPanel}</TabsContent>
        </Tabs>
      ) : (
        detailContent
      )}

      {canManageEvents && isSeries ? renderSeriesManagerActions(occurrence) : null}
      {canManageEvents && !isSeries ? (
        <DialogFooter className={styles.TribeEventDetailDialog__actions}>
          <Button
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantSecondary}
            onClick={() => onEdit(occurrence)}
          >
            {COPY.editButton}
          </Button>
          <Button
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantDestructive}
            onClick={() => onDelete(occurrence)}
          >
            {COPY.deleteButton}
          </Button>
        </DialogFooter>
      ) : null}
    </>
  );
}
