import type { LucideIcon } from "lucide-react";
import {
  MapPinIcon,
  MessageCircleQuestionIcon,
  RadioIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";

import type { TribeEventType } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_TYPE_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import { TRIBE_EVENT_TYPE } from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

/**
 * Icon of each event type. Together with the label it keeps the type
 * readable without relying on color.
 */
export const TRIBE_EVENT_TYPE_ICON: Record<TribeEventType, LucideIcon> = {
  [TRIBE_EVENT_TYPE.live]: RadioIcon,
  [TRIBE_EVENT_TYPE.workshop]: WrenchIcon,
  [TRIBE_EVENT_TYPE.questionsAndAnswers]: MessageCircleQuestionIcon,
  [TRIBE_EVENT_TYPE.inPerson]: MapPinIcon,
  [TRIBE_EVENT_TYPE.social]: UsersIcon,
};

/**
 * `default`: tinted badge with icon and visible label. `compact`: icon only,
 * with the label kept for assistive technology (month grid pills).
 */
export const TRIBE_EVENT_TYPE_BADGE_VARIANT = {
  compact: "compact",
  default: "default",
} as const;

type TribeEventTypeBadgeVariant =
  (typeof TRIBE_EVENT_TYPE_BADGE_VARIANT)[keyof typeof TRIBE_EVENT_TYPE_BADGE_VARIANT];

type TribeEventTypeBadgeProps = {
  eventType: TribeEventType;
  variant?: TribeEventTypeBadgeVariant;
};

/**
 * Colored marker of an event type: icon plus label, colored through the
 * `data-event-type` tokens of `src/styles/event-type-tokens.css`.
 */
export function TribeEventTypeBadge({
  eventType,
  variant = TRIBE_EVENT_TYPE_BADGE_VARIANT.default,
}: TribeEventTypeBadgeProps) {
  const TypeIcon = TRIBE_EVENT_TYPE_ICON[eventType];
  const label = TRIBE_EVENT_TYPE_LABEL[eventType];
  const isCompact = variant === TRIBE_EVENT_TYPE_BADGE_VARIANT.compact;

  return (
    <span
      className={
        isCompact ? styles["TribeEventTypeBadge--compact"] : styles.TribeEventTypeBadge
      }
      data-event-type={eventType}
      title={isCompact ? label : undefined}
    >
      <TypeIcon aria-hidden className={styles.TribeEventTypeBadge__icon} />
      <span className={isCompact ? styles.TribeEventTypeBadge__srOnly : undefined}>{label}</span>
    </span>
  );
}
