"use client";

/** List item that enters, leaves and reflows smoothly inside an `AnimatePresence`. */
import type { HTMLAttributes, ReactNode } from "react";
import { motion, useIsPresent } from "motion/react";

import { joinClassNames } from "@/lib/motion/join-class-names";
import {
  MOTION_DURATION_SECONDS,
  MOTION_EASE_OUT,
  MOTION_ITEM_ENTER_SCALE,
  MOTION_LIST_ITEM_DISTANCE_PX,
  SPRING_LAYOUT,
} from "@/lib/motion/tokens";

import styles from "./styles.module.scss";

const ANIMATED_LIST_ITEM_ELEMENTS = {
  li: motion.li,
  div: motion.div,
  article: motion.article,
} as const;

/** Native handlers whose names collide with Motion's animation and drag callbacks. */
type MotionConflictingHandlers =
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd";

type AnimatedListItemProps = Omit<HTMLAttributes<HTMLElement>, MotionConflictingHandlers> & {
  children: ReactNode;
  as?: keyof typeof ANIMATED_LIST_ITEM_ELEMENTS;
  /** Reflow siblings with a spring when items are added, removed or reordered. */
  layout?: boolean;
};

/**
 * Wrap the list in `<AnimatePresence initial={false}>` so only items added after the
 * first render animate in, and removed items animate out before leaving the DOM.
 * A leaving item turns inert and hidden from assistive technology, so it can no
 * longer be focused, clicked or announced during its exit.
 * @param props - Native attributes, element type and content.
 * @returns The animated item.
 */
export function AnimatedListItem({ children, as = "li", layout = true, className, ...elementProps }: AnimatedListItemProps) {
  const MotionElement = ANIMATED_LIST_ITEM_ELEMENTS[as];
  const isPresent = useIsPresent();

  return (
    <MotionElement
      {...elementProps}
      aria-hidden={isPresent ? elementProps["aria-hidden"] : true}
      inert={!isPresent || undefined}
      className={joinClassNames(styles.AnimatedListItem, className)}
      layout={layout ? "position" : false}
      initial={{ opacity: 0, y: MOTION_LIST_ITEM_DISTANCE_PX, scale: MOTION_ITEM_ENTER_SCALE }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: MOTION_ITEM_ENTER_SCALE, transition: { duration: MOTION_DURATION_SECONDS.exit, ease: MOTION_EASE_OUT } }}
      transition={{ duration: MOTION_DURATION_SECONDS.panel, ease: MOTION_EASE_OUT, layout: SPRING_LAYOUT }}
    >
      {children}
    </MotionElement>
  );
}
