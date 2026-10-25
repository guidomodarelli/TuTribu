/**
 * Server-rendered placeholders for route `loading.tsx` files: one busy region with one status, and blocks shaped like the
 * page that is loading (lines, fields, facts, rows, a step-by-step panel). They read no session, storage or clock, so the
 * fallback is deterministic on page loads and client navigations.
 *
 * `@golfo/ui`'s `Skeleton` only draws text lines and announces its own status, so route shapes are built here with the
 * same block look and finite pulse.
 *
 * @module route-skeleton
 */
import type { ReactNode } from "react";
import styles from "./styles.module.scss";

/** Shapes a block can take; each maps to the size of the real control it stands for. */
export type SkeletonBlockKind = "eyebrow" | "title" | "heading" | "text" | "control" | "area" | "button" | "badge" | "marker";

/** Share of the row a text-like block covers. */
export type SkeletonBlockWidth = "short" | "medium" | "long" | "full";

/** Defaults that keep each placeholder group close to its real content. */
const ROUTE_SKELETON_DEFAULT = { lineCount: 2, rowCount: 3, factCount: 3, stepCount: 4, fieldCount: 2, actionCount: 2 } as const;

/** @param prefix - Placeholder group. @param count - Placeholders in the group. @returns Stable keys for lists that never reorder. */
function placeholderKeys(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_placeholder, index) => `${prefix}-${index}`);
}

/**
 * @param props.label - Accessible name of the region, usually the page title.
 * @param props.status - The one loading announcement of the route.
 * @param props.children - Real static headings and placeholder groups, in page order.
 * @param props.className - Layout of the page that is loading.
 * @returns A busy region with a visually hidden status, so screen readers hear one message.
 */
export function RouteSkeleton({ label, status, children, className }: { label: string; status: string; children: ReactNode; className?: string }) {
  return <section className={className ? `${styles.RouteSkeleton} ${className}` : styles.RouteSkeleton} aria-label={label} aria-busy="true">
    <p className={styles.RouteSkeleton__status} role="status">{status}</p>
    {children}
  </section>;
}

/** @param props - Block shape and width. @returns One decorative placeholder block. */
export function SkeletonBlock({ kind, width = "full" }: { kind: SkeletonBlockKind; width?: SkeletonBlockWidth }) {
  return <span aria-hidden="true" className={`${styles.SkeletonBlock} ${styles[`SkeletonBlock--${kind}`]} ${styles[`SkeletonBlock--${width}`]}`} />;
}

/** @param props.count - Lines of the paragraph; the last one is shorter, like running text. @returns A paragraph placeholder. */
export function SkeletonLines({ count = ROUTE_SKELETON_DEFAULT.lineCount }: { count?: number }) {
  return <span aria-hidden="true" className={styles.SkeletonGroup}>
    {placeholderKeys("line", count).map((key, index) => <SkeletonBlock key={key} kind="text" width={index === count - 1 ? "medium" : "full"} />)}
  </span>;
}

/** @param props.area - Whether the field is a multi-line text area. @returns A label above an input placeholder. */
export function SkeletonField({ area = false }: { area?: boolean }) {
  return <span aria-hidden="true" className={styles.SkeletonField}>
    <SkeletonBlock kind="text" width="short" />
    <SkeletonBlock kind={area ? "area" : "control"} />
  </span>;
}

/**
 * @param props.count - Buttons in the row.
 * @param props.align - `end` for form and step actions, `start` for page actions that follow the text.
 * @returns An action row placeholder.
 */
export function SkeletonActions({ count = ROUTE_SKELETON_DEFAULT.actionCount, align = "end" }: { count?: number; align?: "start" | "end" }) {
  return <span aria-hidden="true" className={align === "start" ? `${styles.SkeletonActions} ${styles["SkeletonActions--start"]}` : styles.SkeletonActions}>
    {placeholderKeys("action", count).map((key) => <SkeletonBlock key={key} kind="button" />)}
  </span>;
}

/** @param props.count - Term and value pairs. @returns A summary of facts, as a description list shows them. */
export function SkeletonFacts({ count = ROUTE_SKELETON_DEFAULT.factCount }: { count?: number }) {
  return <span aria-hidden="true" className={styles.SkeletonFacts}>
    {placeholderKeys("fact", count).map((key) => <span key={key} className={styles.SkeletonFacts__fact}>
      <SkeletonBlock kind="text" width="short" />
      <SkeletonBlock kind="heading" width="short" />
    </span>)}
  </span>;
}

/**
 * @param props.count - Rows in the list.
 * @param props.action - Whether each row ends with a button.
 * @returns A list of rows, each with a title and a meta line.
 */
export function SkeletonRows({ count = ROUTE_SKELETON_DEFAULT.rowCount, action = true }: { count?: number; action?: boolean }) {
  return <span aria-hidden="true" className={styles.SkeletonRows}>
    {placeholderKeys("row", count).map((key) => <span key={key} className={styles.SkeletonRows__row}>
      <span className={styles.SkeletonRows__text}>
        <SkeletonBlock kind="text" width="medium" />
        <SkeletonBlock kind="text" width="long" />
      </span>
      {action && <SkeletonBlock kind="button" />}
    </span>)}
  </span>;
}

/**
 * @param props.stepCount - Markers in the progress row.
 * @param props.fieldCount - Fields of the current step.
 * @returns A bordered step-by-step panel: progress, step title, fields and its back and next actions.
 */
export function SkeletonStepsPanel({ stepCount = ROUTE_SKELETON_DEFAULT.stepCount, fieldCount = ROUTE_SKELETON_DEFAULT.fieldCount }: { stepCount?: number; fieldCount?: number }) {
  return <span aria-hidden="true" className={styles.SkeletonStepsPanel}>
    <span className={styles.SkeletonStepsPanel__progress}>
      <span className={styles.SkeletonStepsPanel__markers}>
        {placeholderKeys("step", stepCount).map((key) => <SkeletonBlock key={key} kind="marker" />)}
      </span>
      <SkeletonBlock kind="text" width="short" />
    </span>
    <span className={styles.SkeletonGroup}>
      <SkeletonBlock kind="heading" width="medium" />
      <SkeletonBlock kind="text" width="long" />
    </span>
    {placeholderKeys("field", fieldCount).map((key) => <SkeletonField key={key} />)}
    <SkeletonActions />
  </span>;
}
