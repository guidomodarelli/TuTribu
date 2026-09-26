"use client";

/**
 * Like control shared by the round feed and the message details dialog: the
 * heart pops when the viewer likes a message and the counter rolls in the
 * direction of the change. The optimistic like state is owned by the caller.
 */
import { HeartIcon } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { MouseEvent } from "react";

import { Button } from "beez-ui";

import { AnimatedCount } from "@/components/motion/animated-count";
import { joinClassNames } from "@/lib/motion/join-class-names";
import { MOTION_DURATION_SECONDS, MOTION_EASE_OUT } from "@/lib/motion/tokens";

import styles from "./styles.module.scss";

/** Peak scale the heart reaches while popping into the liked state. */
const LIKE_HEART_POP_SCALE = 1.28;

/** Heart animation states keyed by whether the viewer likes the message. */
const LIKE_HEART_VARIANTS: Variants = {
  idle: { scale: 1 },
  liked: {
    scale: [1, LIKE_HEART_POP_SCALE, 1],
    transition: { duration: MOTION_DURATION_SECONDS.reveal, ease: MOTION_EASE_OUT },
  },
};

/** Variant names applied to the heart for each like state. */
const LIKE_HEART_VARIANT_KEY = {
  idle: "idle",
  liked: "liked",
} as const;

/** Button attributes shared with the rest of the round actions. */
const MESSAGE_LIKE_BUTTON_UI = {
  buttonType: "button",
  outlineVariant: "outline",
} as const;

type MessageLikeButtonProps = {
  /** Accessible name, including the current count (for example "Me gusta 3"). */
  ariaLabel: string;
  /** Visual state classes owned by the caller (base and active modifiers). */
  className: string;
  isDisabled: boolean;
  isLiked: boolean;
  likeCount: number;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

/**
 * Renders the like button with its animated heart and counter.
 *
 * The heart starts in its resting state (`initial={false}`), so server-rendered
 * and already-liked messages never pop on load; only a change to liked does.
 *
 * @param props - Accessible label, state classes, like state and click handler.
 * @returns The like button.
 */
export function MessageLikeButton({
  ariaLabel,
  className,
  isDisabled,
  isLiked,
  likeCount,
  onClick,
}: MessageLikeButtonProps) {
  return (
    <Button
      aria-label={ariaLabel}
      aria-pressed={isLiked}
      className={joinClassNames(styles.MessageLikeButton, className)}
      disabled={isDisabled}
      onClick={onClick}
      type={MESSAGE_LIKE_BUTTON_UI.buttonType}
      variant={MESSAGE_LIKE_BUTTON_UI.outlineVariant}
    >
      <motion.span
        animate={isLiked ? LIKE_HEART_VARIANT_KEY.liked : LIKE_HEART_VARIANT_KEY.idle}
        aria-hidden
        className={styles.MessageLikeButton__heart}
        initial={false}
        variants={LIKE_HEART_VARIANTS}
      >
        <HeartIcon />
      </motion.span>
      <AnimatedCount className={styles.MessageLikeButton__count} value={likeCount} />
    </Button>
  );
}
