/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the Arc Pro license (https://uiarc.dev/license). Not covered by this project's license; do not redistribute it on its own.
 */

/**
 * @file Idle loop of the morph loader: per stroke offsets and the drawing's turn for each loading
 * variant, as pure functions of the loop clock.
 */

import { DEGREES_PER_TURN, FULL_TURN_RADIANS, HALF, STROKE_COUNT } from "./morph-loader-geometry";
import type { MorphLoaderShape, StrokePose } from "./morph-loader-geometry";

const QUARTER_TURN_DEGREES = DEGREES_PER_TURN / STROKE_COUNT;
const SMOOTHSTEP_CUBIC = 3;
const SMOOTHSTEP_SLOPE = 2;

const DOTS_LOOP = { periodSeconds: 0.9, phaseStep: 0.8, lift: 3.2, swell: 0.6, bouncingDots: 3 };
const BARS_LOOP = { periodSeconds: 0.95, phaseStep: 0.7, shrink: 7.5 };
const RING_LOOP = { breathPeriodSeconds: 1.4, shrink: 3.2, degreesPerSecond: 330 };
/** The square tumbles a quarter turn per period, easing over the first part of it. */
const SQUARE_LOOP = { periodSeconds: 0.9, easedFraction: 0.8, tuck: 8 };

/** Offsets added to each stroke's pose on one frame of the idle loop. */
export type StrokeOffsets = Partial<StrokePose>[];

/** Cubic ease in and out on a 0 to 1 progress. */
export function smoothStep(progress: number): number {
  return progress * progress * (SMOOTHSTEP_CUBIC - SMOOTHSTEP_SLOPE * progress);
}

const emptyOffsets = (): StrokeOffsets => Array.from({ length: STROKE_COUNT }, () => ({}));

/**
 * Stroke offsets for one frame of a variant's idle loop.
 *
 * @param shape - Shape the strokes are posed in.
 * @param clockSeconds - Loop clock.
 * @param amount - How much of the loop shows: 1 while loading, easing to 0 as a mark settles.
 * @returns One offset per stroke; settled marks get no offsets.
 */
export function idleOffsets(shape: MorphLoaderShape, clockSeconds: number, amount: number): StrokeOffsets {
  const offsets = emptyOffsets();
  if (shape === "dots") {
    for (let index = 0; index < DOTS_LOOP.bouncingDots; index += 1) {
      const phase = Math.sin((clockSeconds / DOTS_LOOP.periodSeconds) * FULL_TURN_RADIANS - index * DOTS_LOOP.phaseStep);
      const rise = Math.max(0, phase) * amount;
      offsets[index] = { cy: -DOTS_LOOP.lift * rise, w: DOTS_LOOP.swell * rise };
    }
  } else if (shape === "bars") {
    for (let index = 0; index < STROKE_COUNT; index += 1) {
      const phase =
        HALF + HALF * Math.sin((clockSeconds / BARS_LOOP.periodSeconds) * FULL_TURN_RADIANS - index * BARS_LOOP.phaseStep);
      offsets[index] = { len: -BARS_LOOP.shrink * (1 - phase) * amount };
    }
  } else if (shape === "ring") {
    const breath = Math.sin((clockSeconds * FULL_TURN_RADIANS) / RING_LOOP.breathPeriodSeconds);
    return offsets.map(() => ({ len: -RING_LOOP.shrink * (HALF + HALF * breath) * amount }));
  } else if (shape === "square") {
    // Each quarter turn tucks the sides in so the corners open, then closes them as the square lands.
    const step = (clockSeconds / SQUARE_LOOP.periodSeconds) % 1;
    const open = Math.sin(smoothStep(Math.min(1, step / SQUARE_LOOP.easedFraction)) * Math.PI);
    return offsets.map(() => ({ len: -SQUARE_LOOP.tuck * open * amount }));
  }
  return offsets;
}

/** Drawing angle of the tumbling square at a point of the loop clock. */
function squareAngle(clockSeconds: number): number {
  const turns = clockSeconds / SQUARE_LOOP.periodSeconds;
  return (Math.floor(turns) + smoothStep(Math.min(1, (turns % 1) / SQUARE_LOOP.easedFraction))) * QUARTER_TURN_DEGREES;
}

/**
 * Degrees the drawing turns over one frame, or `null` for variants that stay upright.
 *
 * @param shape - Shape the strokes are posed in.
 * @param clockSeconds - Loop clock after the frame.
 * @param deltaSeconds - Frame duration.
 * @param amount - How much of the loop shows.
 */
export function idleTurn(shape: MorphLoaderShape, clockSeconds: number, deltaSeconds: number, amount: number): number | null {
  if (shape === "ring") return deltaSeconds * RING_LOOP.degreesPerSecond * amount;
  if (shape === "square") return (squareAngle(clockSeconds) - squareAngle(clockSeconds - deltaSeconds)) * amount;
  return null;
}

/** Next full revolution at or after an angle, so a finished mark always lands upright. */
export function nextUprightAngle(degrees: number): number {
  return Math.ceil((degrees - 1) / DEGREES_PER_TURN) * DEGREES_PER_TURN;
}
