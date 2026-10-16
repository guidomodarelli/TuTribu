/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the Arc Pro license (https://uiarc.dev/license). Not covered by this project's license; do not redistribute it on its own.
 */

/**
 * @file Geometry of the morph loader: every shape is the same four strokes in a new pose, drawn on a
 * 24 unit grid, so any shape can spring into any other.
 */

/** Loading shapes the loader can idle in. */
export type MorphLoaderVariant = "dots" | "bars" | "ring" | "square";
/** Request state the loader reflects: the variant while loading, then a check or a cross. */
export type MorphLoaderStatus = "loading" | "success" | "error";
/** Every pose the four strokes can take. */
export type MorphLoaderShape = MorphLoaderVariant | "success" | "error";

/** One stroke: a center, a chord length, a direction in degrees, a bend (1 / radius), a width and an opacity. */
export interface StrokePose {
  cx: number;
  cy: number;
  len: number;
  ang: number;
  bend: number;
  w: number;
  o: number;
}

/** Animatable stroke properties, in a fixed order. */
export type StrokePoseKey = keyof StrokePose;

interface GridPoint {
  x: number;
  y: number;
}

/** Number of strokes every shape is drawn with. */
export const STROKE_COUNT = 4;
export const STROKE_POSE_KEYS: StrokePoseKey[] = ["cx", "cy", "len", "ang", "bend", "w", "o"];

const GRID_CENTER = 12;
export const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;
export const DEGREES_PER_TURN = 360;
const RADIANS_PER_DEGREE = Math.PI / DEGREES_PER_HALF_TURN;
export const FULL_TURN_RADIANS = DEGREES_PER_TURN * RADIANS_PER_DEGREE;
/** Chord length that renders a stroke as a round dot. */
const DOT_LENGTH = 0.01;
/** Bends below this value draw as straight lines. */
export const STRAIGHT_BEND_THRESHOLD = 0.004;
const PATH_PRECISION = 3;
const ARC_QUARTER_OFFSET_DEGREES = 90;

const DOTS = { y: GRID_CENTER, size: 4 };
const BARS = { top: 6, bottom: 18, width: 3 };
const RING = { radius: 8.5, span: 64 };
const SQUARE = { near: 5, far: 19 };

const toDegrees = (radians: number) => radians / RADIANS_PER_DEGREE;
const toRadians = (degrees: number) => degrees * RADIANS_PER_DEGREE;

/** A straight stroke between two grid points. */
function line(from: GridPoint, to: GridPoint, width: number): StrokePose {
  return {
    cx: (from.x + to.x) * HALF,
    cy: (from.y + to.y) * HALF,
    len: Math.hypot(to.x - from.x, to.y - from.y),
    ang: toDegrees(Math.atan2(to.y - from.y, to.x - from.x)),
    bend: 0,
    w: width,
    o: 1,
  };
}

/** An arc of a circle around the grid center, centered on an angle and covering a span in degrees. */
function arc(centerDegrees: number, width: number): StrokePose {
  const halfSpan = toRadians(RING.span * HALF);
  const middle = toRadians(centerDegrees);
  return {
    cx: GRID_CENTER + RING.radius * Math.cos(halfSpan) * Math.cos(middle),
    cy: GRID_CENTER + RING.radius * Math.cos(halfSpan) * Math.sin(middle),
    len: (RING.radius * Math.sin(halfSpan)) / HALF,
    ang: centerDegrees + ARC_QUARTER_OFFSET_DEGREES,
    bend: 1 / RING.radius,
    w: width,
    o: 1,
  };
}

function dot(x: number): StrokePose {
  return { cx: x, cy: DOTS.y, len: DOT_LENGTH, ang: 0, bend: 0, w: DOTS.size, o: 1 };
}

const DOT_COLUMNS = [{ x: 5 }, { x: GRID_CENTER }, { x: 19 }];
const BAR_COLUMNS = [{ x: 4.5 }, { x: 9.5 }, { x: 14.5 }, { x: 19.5 }];
const RING_CENTERS = [{ degrees: -90 }, { degrees: 0 }, { degrees: 90 }, { degrees: 180 }];
const SQUARE_CORNERS: GridPoint[] = [
  { x: SQUARE.near, y: SQUARE.near },
  { x: SQUARE.far, y: SQUARE.near },
  { x: SQUARE.far, y: SQUARE.far },
  { x: SQUARE.near, y: SQUARE.far },
];
/** The check is split in four segments so it draws itself in stroke order. */
const CHECK_POINTS: GridPoint[] = [
  { x: 5, y: 12.5 },
  { x: 7.6, y: 15.1 },
  { x: 10.2, y: 17.7 },
  { x: 14.6, y: 12.6 },
  { x: 19, y: 7.5 },
];
/** Each arm of the cross meets the center, so its strokes start where the check's strokes do. */
const CROSS_SEGMENTS: { from: GridPoint; to: GridPoint }[] = [
  { from: { x: 6.5, y: 6.5 }, to: { x: GRID_CENTER, y: GRID_CENTER } },
  { from: { x: GRID_CENTER, y: GRID_CENTER }, to: { x: 17.5, y: 17.5 } },
  { from: { x: 17.5, y: 6.5 }, to: { x: GRID_CENTER, y: GRID_CENTER } },
  { from: { x: GRID_CENTER, y: GRID_CENTER }, to: { x: 6.5, y: 17.5 } },
];

/**
 * Poses of the four strokes for a shape.
 *
 * @param shape - Loading variant, or the success or error mark.
 * @param strokeWidth - Stroke thickness in grid units for the ring, square, check and cross.
 * @returns Four stroke poses, in drawing order.
 */
export function shapePoses(shape: MorphLoaderShape, strokeWidth: number): StrokePose[] {
  switch (shape) {
    case "dots":
      return [...DOT_COLUMNS.map((column) => dot(column.x)), { ...dot(GRID_CENTER), w: 0, o: 0 }];
    case "bars":
      return BAR_COLUMNS.map((column) =>
        line({ x: column.x, y: BARS.top }, { x: column.x, y: BARS.bottom }, BARS.width),
      );
    case "ring":
      return RING_CENTERS.map((center) => arc(center.degrees, strokeWidth));
    case "square":
      return SQUARE_CORNERS.map((corner, index) =>
        line(corner, SQUARE_CORNERS[(index + 1) % STROKE_COUNT], strokeWidth),
      );
    case "success":
      return CHECK_POINTS.slice(0, STROKE_COUNT).map((point, index) =>
        line(point, CHECK_POINTS[index + 1], strokeWidth),
      );
    case "error":
      return CROSS_SEGMENTS.map((segment) => line(segment.from, segment.to, strokeWidth));
  }
}

/**
 * SVG path data for one stroke. A bend near zero is a straight line; anything more is an arc through
 * the same end points.
 *
 * @param pose - Stroke pose on the 24 unit grid.
 * @returns The `d` attribute of the stroke path.
 */
export function strokePath(pose: StrokePose): string {
  const half = Math.max(pose.len, DOT_LENGTH) * HALF;
  const angle = toRadians(pose.ang);
  const deltaX = Math.cos(angle) * half;
  const deltaY = Math.sin(angle) * half;
  const startX = (pose.cx - deltaX).toFixed(PATH_PRECISION);
  const startY = (pose.cy - deltaY).toFixed(PATH_PRECISION);
  const endX = (pose.cx + deltaX).toFixed(PATH_PRECISION);
  const endY = (pose.cy + deltaY).toFixed(PATH_PRECISION);
  if (Math.abs(pose.bend) < STRAIGHT_BEND_THRESHOLD) {
    return `M${startX} ${startY}L${endX} ${endY}`;
  }
  const radius = (1 / Math.abs(pose.bend)).toFixed(PATH_PRECISION);
  const sweep = pose.bend > 0 ? 1 : 0;
  return `M${startX} ${startY}A${radius} ${radius} 0 0 ${sweep} ${endX} ${endY}`;
}

/**
 * The shortest turn to a new direction. Straight strokes look the same reversed, so they may also flip
 * by half a turn.
 *
 * @param from - Current direction in degrees.
 * @param to - Target direction in degrees.
 * @param symmetric - Whether the stroke looks the same rotated half a turn.
 * @returns The target direction moved to the turn closest to `from`.
 */
export function nearestAngle(from: number, to: number, symmetric: boolean): number {
  const period = symmetric ? DEGREES_PER_HALF_TURN : DEGREES_PER_TURN;
  return to + Math.round((from - to) / period) * period;
}
