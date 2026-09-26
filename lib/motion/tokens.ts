/**
 * Motion timing, curves and physics shared by product animations.
 *
 * Values mirror the internal tokens `beez-ui` uses for its primitives (dialogs,
 * menus, buttons) so product motion and library motion feel like one system.
 * `beez-ui` does not export them, so they are restated here; keep both aligned
 * when the library changes its motion language.
 */

/** Durations in seconds, the unit `motion/react` transitions expect. */
export const MOTION_DURATION_SECONDS = {
  fast: 0.14,
  enter: 0.18,
  panel: 0.22,
  exit: 0.12,
  reveal: 0.32,
  collapse: 0.26,
} as const;

/** Cubic-bezier control points, in CSS `cubic-bezier(x1, y1, x2, y2)` order. */
const EASE_OUT_CONTROL_POINTS = { x1: 0.16, y1: 1, x2: 0.3, y2: 1 } as const;
const EASE_IN_OUT_CONTROL_POINTS = { x1: 0.77, y1: 0, x2: 0.175, y2: 1 } as const;

/** Strong ease-out for entrances; weak defaults such as `easeOut` feel sluggish. */
export const MOTION_EASE_OUT = [
  EASE_OUT_CONTROL_POINTS.x1,
  EASE_OUT_CONTROL_POINTS.y1,
  EASE_OUT_CONTROL_POINTS.x2,
  EASE_OUT_CONTROL_POINTS.y2,
] as const;

/** Symmetric curve for reversible effects such as collapsing regions. */
export const MOTION_EASE_IN_OUT = [
  EASE_IN_OUT_CONTROL_POINTS.x1,
  EASE_IN_OUT_CONTROL_POINTS.y1,
  EASE_IN_OUT_CONTROL_POINTS.x2,
  EASE_IN_OUT_CONTROL_POINTS.y2,
] as const;

/** Shared-layout glides and list reflow. */
export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;

/** Small, confident pops for counters and badges. */
export const SPRING_POP = {
  type: "spring",
  stiffness: 520,
  damping: 30,
  mass: 0.5,
} as const;

/** Vertical travel, in pixels, of an entering list item. */
export const MOTION_LIST_ITEM_DISTANCE_PX = 6;

/** Vertical travel, in pixels, of content swapped in place. */
export const MOTION_CONTENT_DISTANCE_PX = 4;

/** Scale a freshly inserted item starts from. */
export const MOTION_ITEM_ENTER_SCALE = 0.98;
