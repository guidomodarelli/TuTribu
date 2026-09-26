"use client";

/** Cross-fades between states of the same region, such as idle, loading and result. */
import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";

import { joinClassNames } from "@/lib/motion/join-class-names";
import { MOTION_CONTENT_DISTANCE_PX, MOTION_DURATION_SECONDS, MOTION_EASE_OUT } from "@/lib/motion/tokens";

import styles from "./styles.module.scss";

const PRESENCE_SWAP_ELEMENTS = {
  div: motion.div,
  span: motion.span,
} as const;

type PresenceSwapProps = {
  /** Changing the key plays the exit of the previous content and the entry of the new one. */
  presenceKey: string;
  children: ReactNode;
  as?: keyof typeof PRESENCE_SWAP_ELEMENTS;
  className?: string;
  /** `wait` swaps sequentially; `popLayout` overlaps them for inline content. */
  mode?: "wait" | "popLayout";
};

type PresenceSwapItemProps = {
  as: keyof typeof PRESENCE_SWAP_ELEMENTS;
  className: string;
  children: ReactNode;
};

/**
 * One keyed state of the swap. While it animates out it turns inert and hidden
 * from assistive technology, so stale controls cannot be clicked or announced.
 * @param props - Element type, class name and content.
 * @returns The animated state.
 */
function PresenceSwapItem({ as, className, children }: PresenceSwapItemProps) {
  const MotionElement = PRESENCE_SWAP_ELEMENTS[as];
  const isPresent = useIsPresent();

  return (
    <MotionElement
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent || undefined}
      className={className}
      initial={{ opacity: 0, y: MOTION_CONTENT_DISTANCE_PX }}
      animate={{ opacity: 1, y: 0, transition: { duration: MOTION_DURATION_SECONDS.enter, ease: MOTION_EASE_OUT } }}
      exit={{ opacity: 0, y: -MOTION_CONTENT_DISTANCE_PX, transition: { duration: MOTION_DURATION_SECONDS.exit, ease: MOTION_EASE_OUT } }}
    >
      {children}
    </MotionElement>
  );
}

/**
 * Swaps keyed content with a short lift-and-fade; the first render is not animated.
 * @param props - Key identifying the current state and its content.
 * @returns The animated content.
 */
export function PresenceSwap({ presenceKey, children, as = "div", className, mode = "wait" }: PresenceSwapProps) {
  return (
    <AnimatePresence mode={mode} initial={false}>
      <PresenceSwapItem
        key={presenceKey}
        as={as}
        className={joinClassNames(styles.PresenceSwap, as === "span" && styles["PresenceSwap--inline"], className)}
      >
        {children}
      </PresenceSwapItem>
    </AnimatePresence>
  );
}
