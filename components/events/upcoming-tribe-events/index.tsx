import { Link } from "@/components/navigation/link";
import {
  formatBuenosAiresDateTimeRange,
  getBuenosAiresMonthKey,
} from "@/lib/date-time/buenos-aires-format";
import { ROUTES } from "@/src/constants/routes";
import type { TribeEventOccurrenceResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_RECURRENCE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import { TRIBE_EVENT_RECURRENCE_FREQUENCY } from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type UpcomingTribeEventsProps = {
  events: TribeEventOccurrenceResult[];
  tribeSlug: string;
};

const HEADING_ID = "upcoming-tribe-events-heading";
const ROUTE_QUERY = {
  month: "?month=",
} as const;
const LINK_ATTRIBUTE = {
  noreferrer: "noreferrer",
  targetBlank: "_blank",
} as const;
const COPY = {
  heading: "Próximos eventos",
  linkOpen: "Abrir link",
  seeAll: "Ver todos los eventos",
} as const;

function buildEventsRoute(tribeSlug: string, occurrenceStartsAt: string): string {
  return (
    ROUTES.tribes.events(tribeSlug) +
    ROUTE_QUERY.month +
    getBuenosAiresMonthKey(occurrenceStartsAt)
  );
}

/**
 * Compact agenda of the next occurrences for the tribe home. Renders nothing
 * when the tribe has no upcoming events so the feed stays the focus.
 */
export function UpcomingTribeEvents({ events, tribeSlug }: UpcomingTribeEventsProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={HEADING_ID} className={styles.UpcomingTribeEvents}>
      <div className={styles.UpcomingTribeEvents__header}>
        <h2 className={styles.UpcomingTribeEvents__heading} id={HEADING_ID}>
          {COPY.heading}
        </h2>
        <Link
          className={styles.UpcomingTribeEvents__seeAll}
          href={ROUTES.tribes.events(tribeSlug)}
        >
          {COPY.seeAll}
        </Link>
      </div>
      <ul className={styles.UpcomingTribeEvents__list}>
        {events.map((occurrence) => (
          <li className={styles.UpcomingTribeEvents__item} key={occurrence.occurrenceKey}>
            <div className={styles.UpcomingTribeEvents__itemBody}>
              <Link
                className={styles.UpcomingTribeEvents__title}
                href={buildEventsRoute(tribeSlug, occurrence.startsAt)}
              >
                {occurrence.title}
              </Link>
              <p className={styles.UpcomingTribeEvents__schedule}>
                <time dateTime={occurrence.startsAt}>
                  {formatBuenosAiresDateTimeRange(occurrence.startsAt, occurrence.endsAt)}
                </time>
                {occurrence.recurrenceFrequency !== TRIBE_EVENT_RECURRENCE_FREQUENCY.none ? (
                  <span className={styles.UpcomingTribeEvents__recurrence}>
                    {TRIBE_EVENT_RECURRENCE_LABEL[occurrence.recurrenceFrequency]}
                  </span>
                ) : null}
              </p>
            </div>
            {occurrence.meetingUrl ? (
              <a
                className={styles.UpcomingTribeEvents__meetingLink}
                href={occurrence.meetingUrl}
                rel={LINK_ATTRIBUTE.noreferrer}
                target={LINK_ATTRIBUTE.targetBlank}
              >
                {COPY.linkOpen}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
