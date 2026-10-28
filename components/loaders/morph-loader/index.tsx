/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the Arc Pro license (https://uiarc.dev/license). Not covered by this project's license; do not redistribute it on its own.
 */
"use client";

import { MOTION_EASE, MOTION_EASE_STANDARD, MOTION_TIMING } from "@golfo/ui";
import {
  animate,
  motion,
  motionValue,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useTransform, type AnimationPlaybackControls, type MotionValue, type Transition 
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import {
  DEGREES_PER_TURN,
  FULL_TURN_RADIANS,
  STRAIGHT_BEND_THRESHOLD,
  STROKE_COUNT,
  STROKE_POSE_KEYS,
  nearestAngle,
  shapePoses,
  strokePath,
  type MorphLoaderShape,
  type MorphLoaderStatus,
  type MorphLoaderVariant,
  type StrokePose,
  type StrokePoseKey
} from "./morph-loader-geometry";
import { idleOffsets, idleTurn, nextUprightAngle } from "./morph-loader-idle";
import styles from "./styles.module.scss";

export type { MorphLoaderStatus, MorphLoaderVariant } from "./morph-loader-geometry";

const DEFAULT_LOADING_LABEL = "Cargando...";
const DEFAULT_SUCCESS_LABEL = "Listo";
const DEFAULT_ERROR_LABEL = "No se pudo completar";
const DEFAULT_SIZE_PX = 24;
const DEFAULT_STROKE_WIDTH = 2.5;

/**
 * Spring characters restated as stiffness and damping so a retarget keeps its velocity mid flight. Their visual
 * durations come from the shared `MOTION_TIMING` tokens, inside the 120 to 320 ms motion range.
 */
const SPRING_PERIOD_SCALE = 1.2;
const CRITICAL_DAMPING_FACTOR = 2;
const SPRING_REST_DELTA = 0.001;
const SPRING_REST_SPEED = 0.01;
const MORPH_SPRING = { visualDuration: MOTION_TIMING.standard, bounce: 0.12 };
const SETTLE_SPRING = { visualDuration: MOTION_TIMING.checkDraw, bounce: 0.28 };
const TURN_SPRING = { visualDuration: MOTION_TIMING.standard, bounce: 0.1 };

const POP_PEAK_SCALE = 1.14;
const POP_PEAK_AT = 0.35;
const MAX_FRAME_DELTA_MS = 64;
const MS_PER_SECOND = 1000;
const SETTLED_AMOUNT_THRESHOLD = 0.001;
const UPRIGHT_TOLERANCE_DEGREES = 0.01;
const ROTATE_PRECISION = 3;
const SCALE_PRECISION = 4;

/**
 * Props of {@link MorphLoader}.
 */
export interface MorphLoaderProps {
  /** Loading shape. Changing it while loading morphs the strokes into the new shape. */
  variant?: MorphLoaderVariant;
  /** `"success"` folds the strokes into a check, `"error"` into a cross, `"loading"` gathers them back. */
  status?: MorphLoaderStatus;
  /** Rendered size in px. The drawing is a 24 unit grid, so 16, 20, 24 and 32 stay crisp. */
  size?: number;
  /** Stroke thickness in grid units. */
  strokeWidth?: number;
  /** Colors the check with `--success` and the cross with `--danger`. Off keeps `currentColor`. */
  tone?: boolean;
  /** Announced while loading. */
  label?: string;
  /** Announced on success. */
  successLabel?: string;
  /** Announced on error. */
  errorLabel?: string;
  /** Hides the status from assistive technology, for loaders inside a control that announces its own state. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

type StrokeValues = Record<StrokePoseKey, MotionValue<number>>;

const isSettledShape = (shape: MorphLoaderShape) => shape === "success" || shape === "error";

function physicalSpring({ visualDuration, bounce }: { visualDuration: number; bounce: number }): Transition {
  const angularFrequency = FULL_TURN_RADIANS / (visualDuration * SPRING_PERIOD_SCALE);
  return {
    type: "spring",
    stiffness: angularFrequency * angularFrequency,
    damping: CRITICAL_DAMPING_FACTOR * (1 - bounce) * angularFrequency,
    mass: 1,
    restDelta: SPRING_REST_DELTA,
    restSpeed: SPRING_REST_SPEED,
  };
}

const MORPH_TRANSITION = physicalSpring(MORPH_SPRING);
const SETTLE_TRANSITION = physicalSpring(SETTLE_SPRING);
const TURN_TRANSITION = physicalSpring(TURN_SPRING);

const subscribeToNothing = () => () => {};

/** Reduced motion only after hydration, so the server HTML and the first client render match. */
function useHydratedReducedMotion(): boolean {
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  return Boolean(useReducedMotion()) && hydrated;
}

function createStrokeValues(pose: StrokePose): StrokeValues {
  return Object.fromEntries(STROKE_POSE_KEYS.map((key) => [key, motionValue(pose[key])])) as StrokeValues;
}

function Stroke({ values, wave }: { values: StrokeValues; wave: MotionValue<Partial<StrokePose>> }) {
  const pathData = useTransform(() => {
    const offsets = wave.get();
    const pose = {} as StrokePose;
    for (const key of STROKE_POSE_KEYS) pose[key] = values[key].get() + (offsets[key] ?? 0);
    return strokePath(pose);
  });
  const width = useTransform(() => Math.max(0, values.w.get() + (wave.get().w ?? 0)));
  const opacity = useTransform(() => Math.min(1, Math.max(0, values.o.get())));
  return <motion.path d={pathData} opacity={opacity} strokeWidth={width} />;
}

/** Motion values the idle loop and the settle animation drive, beside the turn in flight. */
type IdleMotion = {
  waves: MotionValue<Partial<StrokePose>>[];
  rotate: MotionValue<number>;
  loopAmount: MotionValue<number>;
  pop: MotionValue<number>;
  turning: RefObject<AnimationPlaybackControls | null>;
};

/**
 * Springs every stroke value to the pose of the new shape, or sets it at once under reduced motion.
 *
 * @param target - Stroke values, the new shape, stroke width and the reduced motion preference.
 * @returns The animations started, to stop on the next change.
 */
function animateStrokes({ strokes, shape, strokeWidth, reduceMotion }: { strokes: StrokeValues[]; shape: MorphLoaderShape; strokeWidth: number; reduceMotion: boolean }): AnimationPlaybackControls[] {
  const settling = isSettledShape(shape);
  const controls: AnimationPlaybackControls[] = [];
  shapePoses(shape, strokeWidth).forEach((pose, index) => {
    const values = strokes[index];
    for (const key of STROKE_POSE_KEYS) {
      const value = values[key];
      const target =
        key === "ang"
          ? nearestAngle(value.get(), pose.ang, pose.bend === 0 && values.bend.get() < STRAIGHT_BEND_THRESHOLD)
          : pose[key];
      if (reduceMotion) {
        value.set(target);
        continue;
      }
      // The check draws itself in stroke order; loading shapes gather all at once.
      const delay = settling ? index * MOTION_TIMING.listStagger : 0;
      controls.push(animate(value, target, { ...(settling ? SETTLE_TRANSITION : MORPH_TRANSITION), delay }));
    }
  });
  return controls;
}

/** @param motion - Idle motion values and the turn in flight. @param settling - Whether the shape is a finished mark. @returns Nothing; every offset, turn and pop is set to its resting value. */
function resetIdleMotion(motion: IdleMotion, settling: boolean): void {
  motion.turning.current?.stop();
  motion.turning.current = null;
  motion.waves.forEach((wave) => wave.set({}));
  motion.loopAmount.set(settling ? 0 : 1);
  motion.rotate.set(0);
  motion.pop.set(1);
}

/** @param motion - Idle motion values and the turn in flight. @param settling - Whether the shape is a finished mark. @returns The loop, turn and pop animations started, to stop on the next change. */
function animateSettling(motion: IdleMotion, settling: boolean): AnimationPlaybackControls[] {
  const controls = [
    animate(motion.loopAmount, settling ? 0 : 1, {
      duration: settling ? MOTION_TIMING.exit : MOTION_TIMING.standard,
      ease: MOTION_EASE_STANDARD,
    }),
  ];
  if (settling) {
    // The finished mark lands upright: the turn carries on to the next full revolution and the mark pops once.
    motion.turning.current?.stop();
    motion.turning.current = animate(motion.rotate, nextUprightAngle(motion.rotate.get()), TURN_TRANSITION);
    controls.push(
      animate(motion.pop, [1, POP_PEAK_SCALE, 1], {
        duration: MOTION_TIMING.standard,
        times: [0, POP_PEAK_AT, 1],
        ease: ["easeOut", "easeInOut"],
      }),
    );
  } else {
    // Loading resumed: a pop stopped mid flight shrinks back instead of leaving the loader enlarged.
    controls.push(animate(motion.pop, 1, { duration: MOTION_TIMING.exit, ease: MOTION_EASE }));
  }
  return controls;
}

/**
 * Advances the idle wave and turn by one frame.
 *
 * @param motion - Idle motion values and the turn in flight.
 * @param frame - Current shape, the idle clock and the frame duration.
 * @returns Nothing; the waves and the rotation move on.
 */
function stepIdleMotion(motion: IdleMotion, { shape, clockSeconds, deltaMs }: { shape: MorphLoaderShape; clockSeconds: RefObject<number>; deltaMs: number }): void {
  const loading = !isSettledShape(shape);
  const amount = motion.loopAmount.get();
  if (!loading && amount < SETTLED_AMOUNT_THRESHOLD) return;
  const deltaSeconds = Math.min(deltaMs, MAX_FRAME_DELTA_MS) / MS_PER_SECOND;
  clockSeconds.current += deltaSeconds * (loading ? 1 : amount);
  const offsets = idleOffsets(shape, clockSeconds.current, amount);
  motion.waves.forEach((wave, index) => wave.set(offsets[index]));

  const turn = loading ? idleTurn(shape, clockSeconds.current, deltaSeconds, amount) : null;
  if (turn !== null) {
    motion.turning.current?.stop();
    motion.turning.current = null;
    motion.rotate.set(motion.rotate.get() + turn);
  } else if (loading && !motion.turning.current && Math.abs(motion.rotate.get() % DEGREES_PER_TURN) > UPRIGHT_TOLERANCE_DEGREES) {
    motion.turning.current = animate(motion.rotate, nextUprightAngle(motion.rotate.get()), TURN_TRANSITION);
  }
}

/** @param status - Loader status. @param labels - Loading, success and error announcements. @returns The announcement of the status. */
function statusAnnouncement(status: MorphLoaderStatus, labels: { label: string; successLabel: string; errorLabel: string }): string {
  if (status === "success") return labels.successLabel;
  return status === "error" ? labels.errorLabel : labels.label;
}

/** @param props - Rendered size, the rotate/pop transform and every stroke's values and wave. @returns The hidden four-stroke drawing. */
function MorphDrawing({ size, transform, strokes, waves }: { size: number; transform: MotionValue<string>; strokes: StrokeValues[]; waves: MotionValue<Partial<StrokePose>>[] }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.MorphLoader__drawing}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      viewBox="0 0 24 24"
      width={size}
    >
      <motion.g style={{ transform, transformOrigin: "12px 12px", transformBox: "view-box" }}>
        {strokes.map((values, index) => (
          <Stroke key={index} values={values} wave={waves[index]} />
        ))}
      </motion.g>
    </svg>
  );
}

/**
 * A small loader drawn from four strokes. Every variant, and the check and cross it ends on, is the same
 * four strokes in a new pose, so changing the variant or the status morphs one shape into the next.
 *
 * Exposes the state through `role="status"` with a Spanish label, and shows a static shape per state under
 * `prefers-reduced-motion`.
 *
 * @param props - Shape, status, size and accessible labels.
 */
export function MorphLoader({
  variant = "dots",
  status = "loading",
  size = DEFAULT_SIZE_PX,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  tone = true,
  label = DEFAULT_LOADING_LABEL,
  successLabel = DEFAULT_SUCCESS_LABEL,
  errorLabel = DEFAULT_ERROR_LABEL,
  decorative = false,
  className,
  style,
}: MorphLoaderProps) {
  const reduceMotion = useHydratedReducedMotion();
  const shape: MorphLoaderShape = status === "loading" ? variant : status;

  // Four strokes, seven values each, springing independently so an interruption keeps every velocity.
  const [strokes] = useState(() => shapePoses(shape, strokeWidth).map(createStrokeValues));
  const [waves] = useState(() =>
    Array.from({ length: STROKE_COUNT }, () => motionValue<Partial<StrokePose>>({})),
  );
  const rotate = useMotionValue(0);
  const loopAmount = useMotionValue(isSettledShape(shape) ? 0 : 1);
  const pop = useMotionValue(1);
  const clockSeconds = useRef(0);
  const turning = useRef<AnimationPlaybackControls | null>(null);
  const shapeRef = useRef(shape);
  useLayoutEffect(() => {
    shapeRef.current = shape;
  }, [shape]);

  useEffect(() => {
    const settling = isSettledShape(shape);
    const controls = animateStrokes({ strokes, shape, strokeWidth, reduceMotion });
    if (reduceMotion) {
      // Clear every animated offset too, so a preference switched mid flight never freezes a half-drawn shape.
      resetIdleMotion({ waves, rotate, loopAmount, pop, turning }, settling);
      return undefined;
    }
    controls.push(...animateSettling({ waves, rotate, loopAmount, pop, turning }, settling));
    return () => controls.forEach((control) => control.stop());
  }, [shape, strokeWidth, reduceMotion, loopAmount, pop, rotate, strokes, waves]);

  useAnimationFrame((_time, deltaMs) => {
    if (reduceMotion) return;
    stepIdleMotion({ waves, rotate, loopAmount, pop, turning }, { shape: shapeRef.current, clockSeconds, deltaMs });
  });

  const transform = useTransform(
    () => `rotate(${rotate.get().toFixed(ROTATE_PRECISION)}deg) scale(${pop.get().toFixed(SCALE_PRECISION)})`,
  );
  const announcement = statusAnnouncement(status, { label, successLabel, errorLabel });
  const rootClassName = [styles.MorphLoader, className].filter(Boolean).join(" ");

  return (
    <span
      aria-label={decorative ? undefined : announcement}
      className={rootClassName}
      data-status={status}
      data-tone={tone ? "" : undefined}
      role={decorative ? undefined : "status"}
      style={{ ...style, width: size, height: size }}
    >
      <MorphDrawing size={size} transform={transform} strokes={strokes} waves={waves} />
      {decorative ? null : <span className={styles.MorphLoader__srOnly}>{announcement}</span>}
    </span>
  );
}
