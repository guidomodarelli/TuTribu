/*
 * Motion values of Arc (https://uiarc.dev), MIT License, Copyright (c) 2026 Elia
 * Kuratli. They match the `--ease-*` and `--duration-*` variables that @astra-kit/ui
 * already exposes, so the app rail moves exactly like the Arc block it adapts.
 */
import { MOTION_EASE } from "@astra-kit/ui";
import type { Transition } from "motion/react";

/** Cubic-bezier control points, in the tuple shape motion expects. */
type CubicBezier = [number, number, number, number];

/** Arc `--ease-standard`: color changes and on-screen moves. */
const EASE_STANDARD_X1 = 0.22;
const EASE_STANDARD_X2 = 0.36;

export const APP_RAIL_MOTION = {
  blur: {
    softPx: 4,
    subtlePx: 2,
  },
  /** Tween for small fades, in seconds. */
  durationStandard: 0.24,
  ease: {
    // Arc `--ease-enter` is the same strong ease-out @astra-kit/ui exports.
    enter: [...MOTION_EASE] as CubicBezier,
    standard: [EASE_STANDARD_X1, 1, EASE_STANDARD_X2, 1] as CubicBezier,
  },
  spring: {
    /** Shared highlights and widths that follow new content. */
    morph: { bounce: 0.16, duration: 0.42, type: "spring" } satisfies Transition,
    /** Panels and drawers: lands without overshoot. */
    smooth: { bounce: 0, duration: 0.4, type: "spring" } satisfies Transition,
    /** Press feedback and small indicators. */
    snappy: { bounce: 0.12, duration: 0.26, type: "spring" } satisfies Transition,
  },
} as const;

export const APP_RAIL_INSTANT: Transition = { duration: 0 };
