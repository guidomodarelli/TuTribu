"use client";

import { CalendarPlusIcon, LightbulbIcon } from "lucide-react";
import { Button } from "beez-ui";

import { TRIBE_EVENT_RECURRENCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import type { TribeEventTemplate } from "@/src/modules/events/constants/tribe-event-templates";
import styles from "./styles.module.scss";

type TribeEventsEmptyStateProps = {
  /** Offered to active members who can propose a meeting. */
  onProposeEvent?: () => void;
  /** Templates offered to managers; omit for members. */
  templates?: readonly TribeEventTemplate[];
  onUseTemplate?: (template: TribeEventTemplate) => void;
};

const BUTTON_ATTRIBUTE = {
  typeButton: "button",
  variantOutline: "outline",
} as const;
const COPY = {
  emptyMonth: "No hay eventos este mes.",
  emptyMonthHint: "Cuando se programe un encuentro, va a aparecer acá.",
  managerHint: "Elegí una plantilla para arrancar o creá un evento desde cero.",
  managerTitle: "Creá tu primer encuentro",
  proposeButton: "Proponer un encuentro",
  templateDuration: (durationMinutes: number) => `${durationMinutes} min`,
  templateMetaSeparator: " · ",
  templatesLabel: "Plantillas de evento",
} as const;

/**
 * Empty month. Members see a quiet message (plus "Proponer un encuentro"
 * when they can propose one); managers get an actionable start with
 * templates that open the create form prefilled.
 */
export function TribeEventsEmptyState({
  onProposeEvent,
  onUseTemplate,
  templates,
}: TribeEventsEmptyStateProps) {
  if (!templates || !onUseTemplate) {
    return (
      <div className={styles.TribeEventsEmptyState}>
        <p className={styles.TribeEventsEmptyState__title}>{COPY.emptyMonth}</p>
        <p className={styles.TribeEventsEmptyState__hint}>{COPY.emptyMonthHint}</p>
        {onProposeEvent ? (
          <Button
            className={styles.TribeEventsEmptyState__proposeButton}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantOutline}
            onClick={onProposeEvent}
          >
            <LightbulbIcon aria-hidden />
            {COPY.proposeButton}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.TribeEventsEmptyState}>
      <p className={styles.TribeEventsEmptyState__title}>{COPY.managerTitle}</p>
      <p className={styles.TribeEventsEmptyState__hint}>{COPY.managerHint}</p>
      <ul aria-label={COPY.templatesLabel} className={styles.TribeEventsEmptyState__templates}>
        {templates.map((template) => (
          <li className={styles.TribeEventsEmptyState__templateItem} key={template.id}>
            <Button
              className={styles.TribeEventsEmptyState__template}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={() => onUseTemplate(template)}
            >
              <CalendarPlusIcon aria-hidden />
              <span className={styles.TribeEventsEmptyState__templateBody}>
                <span className={styles.TribeEventsEmptyState__templateTitle}>
                  {template.title}
                </span>
                <span className={styles.TribeEventsEmptyState__templateMeta}>
                  {TRIBE_EVENT_RECURRENCE_LABEL[template.recurrenceFrequency]}
                  {COPY.templateMetaSeparator}
                  {COPY.templateDuration(template.durationMinutes)}
                </span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
