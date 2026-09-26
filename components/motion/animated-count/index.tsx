"use client";

/** Rolls a numeric value vertically when it changes, in the direction of the change. */
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { joinClassNames } from "@/lib/motion/join-class-names";
import { SPRING_POP } from "@/lib/motion/tokens";

import styles from "./styles.module.scss";

/** Fraction of the line height the digits travel while rolling. */
const COUNT_ROLL_DISTANCE = "60%";
const COUNT_ROLL_DISTANCE_INVERTED = "-60%";

const COUNT_ROLL_VARIANTS = {
  enter: (direction: number) => ({ y: direction > 0 ? COUNT_ROLL_DISTANCE : COUNT_ROLL_DISTANCE_INVERTED, opacity: 0 }),
  center: { y: 0, opacity: 1 },
  exit: (direction: number) => ({ y: direction > 0 ? COUNT_ROLL_DISTANCE_INVERTED : COUNT_ROLL_DISTANCE, opacity: 0 }),
};

type AnimatedCountProps = {
  value: number;
  /** Optional formatter, for example a locale-aware number format. */
  format?: (value: number) => string;
  className?: string;
};

/**
 * Renders `value` and animates each change: increments roll up, decrements roll down.
 * @param props - Current value, optional formatter and class name.
 * @returns The animated number.
 */
export function AnimatedCount({ value, format, className }: AnimatedCountProps) {
  const [previousValue, setPreviousValue] = useState(value);
  const [direction, setDirection] = useState(1);

  if (previousValue !== value) {
    setDirection(value > previousValue ? 1 : -1);
    setPreviousValue(value);
  }

  return (
    <span className={joinClassNames(styles.AnimatedCount, className)}>
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.span
          key={value}
          className={styles.AnimatedCount__value}
          custom={direction}
          variants={COUNT_ROLL_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={SPRING_POP}
        >
          {format ? format(value) : value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
