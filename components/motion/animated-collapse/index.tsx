"use client";

/** Expands and collapses a region by animating its height, then releases overflow. */
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { joinClassNames } from "@/lib/motion/join-class-names";
import { MOTION_DURATION_SECONDS, MOTION_EASE_IN_OUT, MOTION_EASE_OUT } from "@/lib/motion/tokens";

import styles from "./styles.module.scss";

const COLLAPSE_TRANSITION = {
  height: { duration: MOTION_DURATION_SECONDS.collapse, ease: MOTION_EASE_IN_OUT },
  opacity: { duration: MOTION_DURATION_SECONDS.panel, ease: MOTION_EASE_OUT },
} as const;

type AnimatedCollapseProps = {
  /** Whether the region is rendered and expanded. */
  isOpen: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Animate the very first render too; off by default so SSR output stays visible. */
  animateOnMount?: boolean;
};

/**
 * Renders `children` only while `isOpen`, animating height and opacity.
 * Keep padding inside `children`: the animated wrapper collapses to zero height.
 * @param props - Open state, content and optional wrapper attributes.
 * @returns The animated region, or nothing when closed.
 */
export function AnimatedCollapse({ isOpen, children, className, id, animateOnMount = false }: AnimatedCollapseProps) {
  const [isSettled, setIsSettled] = useState(!animateOnMount);

  return (
    <AnimatePresence initial={animateOnMount}>
      {isOpen ? (
        <motion.div
          key="animated-collapse"
          id={id}
          className={joinClassNames(styles.AnimatedCollapse, isSettled && styles["AnimatedCollapse--settled"], className)}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={COLLAPSE_TRANSITION}
          onAnimationStart={() => setIsSettled(false)}
          onAnimationComplete={() => setIsSettled(true)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
