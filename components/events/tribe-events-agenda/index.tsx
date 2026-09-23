"use client";

import type { ReactNode } from "react";
import { Button } from "beez-ui";

import { TribeEventsAgendaDay } from "@/components/events/tribe-events-agenda-day";
import type { TribeEventsAgendaDay as TribeEventsAgendaDayGroup } from "@/lib/events/tribe-events-calendar-grid";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import styles from "./styles.module.scss";

type TribeEventsAgendaProps = {
  agendaDays: TribeEventsAgendaDayGroup[];
  arePastEventsVisible: boolean;
  onTogglePastEvents: () => void;
  pastEventsCount: number;
  /** Renders one agenda row; the container decides which item to use. */
  renderOccurrence: (occurrence: TribeEventOccurrenceResult) => ReactNode;
  /** Whether finished occurrences are folded behind the toggle. */
  shouldCollapsePastEvents: boolean;
  todayKey: string | null;
};

const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantGhost: "ghost",
} as const;
const COPY = {
  hidePastButton: "Ocultar finalizados",
  listLabel: "Lista de eventos",
  showPastButton: (pastCount: number) =>
    pastCount === 1 ? "Ver 1 finalizado" : `Ver ${pastCount} finalizados`,
} as const;

/**
 * Agenda (list) view of the month, grouped by Buenos Aires day, with the
 * toggle that reveals finished occurrences.
 */
export function TribeEventsAgenda({
  agendaDays,
  arePastEventsVisible,
  onTogglePastEvents,
  pastEventsCount,
  renderOccurrence,
  shouldCollapsePastEvents,
  todayKey,
}: TribeEventsAgendaProps) {
  return (
    <section aria-label={COPY.listLabel} className={styles.TribeEventsAgenda}>
      {shouldCollapsePastEvents ? (
        <Button
          aria-expanded={arePastEventsVisible}
          className={styles.TribeEventsAgenda__pastToggle}
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          variant={BUTTON_ATTRIBUTE.variantGhost}
          onClick={onTogglePastEvents}
        >
          {arePastEventsVisible
            ? COPY.hidePastButton
            : COPY.showPastButton(pastEventsCount)}
        </Button>
      ) : null}
      {agendaDays.map((agendaDay) => (
        <section className={styles.TribeEventsAgenda__day} key={agendaDay.dayKey}>
          <TribeEventsAgendaDay
            dayKey={agendaDay.dayKey}
            firstOccurrence={agendaDay.dayEvents[0]}
            todayKey={todayKey}
          >
            {agendaDay.dayEvents.map(renderOccurrence)}
          </TribeEventsAgendaDay>
        </section>
      ))}
    </section>
  );
}
