"use client";

import { TRIBE_EVENT_TYPE_ICON } from "@/components/events/tribe-event-type-badge";
import type { TribeEventType } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_TYPE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import { TRIBE_EVENT_TYPES } from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventsTypeFilterProps = {
  onClear: () => void;
  onToggleType: (eventType: TribeEventType) => void;
  /** Selected types; empty means every type is shown. */
  selectedTypes: readonly TribeEventType[];
};

const BUTTON_TYPE = "button";
const COPY = {
  allTypes: "Todos",
  filterLabel: "Filtrar por tipo de evento",
} as const;

/**
 * Multi-select chips of the event types. Each chip is a toggle button
 * (`aria-pressed`) with its icon, color, and label; "Todos" clears the
 * selection. The chips wrap on narrow screens instead of scrolling.
 */
export function TribeEventsTypeFilter({
  onClear,
  onToggleType,
  selectedTypes,
}: TribeEventsTypeFilterProps) {
  const isShowingAll = selectedTypes.length === 0;

  return (
    <div aria-label={COPY.filterLabel} className={styles.TribeEventsTypeFilter} role="group">
      <button
        aria-pressed={isShowingAll}
        className={styles.TribeEventsTypeFilter__chip}
        type={BUTTON_TYPE}
        onClick={onClear}
      >
        {COPY.allTypes}
      </button>
      {TRIBE_EVENT_TYPES.map((eventType) => {
        const TypeIcon = TRIBE_EVENT_TYPE_ICON[eventType];

        return (
          <button
            aria-pressed={selectedTypes.includes(eventType)}
            className={styles.TribeEventsTypeFilter__chip}
            data-event-type={eventType}
            key={eventType}
            type={BUTTON_TYPE}
            onClick={() => onToggleType(eventType)}
          >
            <TypeIcon aria-hidden className={styles.TribeEventsTypeFilter__icon} />
            {TRIBE_EVENT_TYPE_LABEL[eventType]}
          </button>
        );
      })}
    </div>
  );
}
