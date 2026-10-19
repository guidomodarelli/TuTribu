/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the
 * Arc Pro license (https://uiarc.dev/license). Not covered by this project's
 * license; do not redistribute it on its own.
 *
 * Adapted from the Arc "Skeleton morph" component: timings come from the motion
 * tokens exported by @golfo/ui, styles are a BEM SCSS module, the loading
 * announcement is in Spanish, and every animation keeps a reduced-motion branch.
 */

"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ElementType, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { MOTION_EASE_STANDARD, MOTION_TIMING, SPRING_PANEL } from "@golfo/ui";
import styles from "./styles.module.scss";

/** Region that resolves its blocks one after another once `loading` turns false. */
export type SkeletonMorphProps = {
  /** While true, blocks show their skeletons and the region is marked busy. */
  loading: boolean;
  children: ReactNode;
  /** Seconds between blocks as they resolve in reading order. */
  stagger?: number;
  /** Text announced while loading. */
  loadingLabel?: string;
  /** The root element; style it as the surface so its border follows the eased height. */
  as?: ElementType;
  className?: string;
};

/** One visible piece of the loaded layout and the size of the skeleton that stands in for it. */
export type MorphBlockProps = {
  /** The loaded content; it is not rendered while loading. */
  children?: ReactNode;
  /** Skeleton width, any CSS length. Match the content for the calmest morph. */
  width?: number | string;
  /** Skeleton height, any CSS length. Defaults to one text line, or lines × lineHeight. */
  height?: number | string;
  /** Skeleton corner radius; "circle" for avatars. */
  radius?: number | string | "circle";
  /** Paragraph skeleton with this many lines; the last one is shorter. */
  lines?: number;
  /** Line height of the paragraph in px, so the skeleton is as tall as the text. */
  lineHeight?: number;
  as?: "div" | "span" | "p" | "li" | "section" | "article" | "header" | "footer" | "h2" | "h3" | "h4";
  /** Keeps the loaded block as wide as its container (list rows) instead of fitting its content. */
  fill?: boolean;
  className?: string;
};

type MorphContextValue = { loading: boolean; reduced: boolean; stagger: number; register: (node: HTMLElement) => () => void; order: (node: HTMLElement | null) => number };

const MorphContext = createContext<MorphContextValue | null>(null);

const SKELETON_MORPH_DEFAULT = { stagger: 0.04, loadingLabel: "Cargando", lineHeightPx: 20, skeletonHeight: "12px", radiusPx: 6 } as const;
/** The placeholder fades a beat after it starts stretching onto the content. */
const PLACEHOLDER_FADE = { duration: MOTION_TIMING.standard, delay: 0.06, ease: [...MOTION_EASE_STANDARD] as [number, number, number, number] };
const CONTENT_ENTER = { duration: MOTION_TIMING.standard, ease: [...MOTION_EASE_STANDARD] as [number, number, number, number] };
const CONTENT_BLUR_PX = 4;
const MILLISECONDS_PER_SECOND = 1000;
const AUTO_HEIGHT = -1;
const SETTLED_HEIGHT_DELTA_PX = 1;
const CIRCLE = "circle";
const CIRCLE_RADIUS_PX = 9999;
const BLOCK_STATE = { skeleton: "skeleton", content: "content" } as const;

const subscribeNever = () => () => {};

/** @returns Reduced motion only after hydration, so the server and first client render agree. */
function useReducedFlag(): boolean {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  return Boolean(useReducedMotion()) && hydrated;
}

/** @param value - A number of pixels or any CSS length. @returns A CSS length. */
function cssLength(value: number | string | undefined): string | undefined {
  return typeof value === "number" ? `${value}px` : value;
}

/**
 * @param props - Loading flag, blocks and announcement.
 * @returns A region whose blocks become the real content in reading order while the region eases to its final height.
 */
export function SkeletonMorph({ loading, children, stagger = SKELETON_MORPH_DEFAULT.stagger, loadingLabel = SKELETON_MORPH_DEFAULT.loadingLabel, as: Tag = "div", className }: SkeletonMorphProps) {
  const reduced = useReducedFlag();
  const blocks = useRef(new Set<HTMLElement>());
  const register = useCallback((node: HTMLElement) => {
    blocks.current.add(node);
    return () => { blocks.current.delete(node); };
  }, []);
  // Reading order is DOM order, so the reveal cascades down the layout whatever the component tree looks like.
  const order = useCallback((node: HTMLElement | null) => {
    if (!node) return 0;
    let index = 0;
    for (const other of blocks.current) if (other !== node && other.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) index += 1;
    return index;
  }, []);
  const value = useMemo(() => ({ loading, reduced, stagger, register, order }), [loading, order, reduced, register, stagger]);

  // The shell eases between heights and clips while it does, so a border never jumps and content never pokes out.
  const innerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const shellHeight = useMotionValue(AUTO_HEIGHT);
  const height = useTransform(shellHeight, (next) => next < 0 ? "auto" : `${next}px`);
  useLayoutEffect(() => {
    const inner = innerRef.current, shell = shellRef.current;
    if (!inner || !shell) return;
    let last = inner.offsetHeight;
    let controls: { stop: () => void } | null = null;
    const settle = () => { shellHeight.jump(AUTO_HEIGHT); delete shell.dataset.easing; };
    const observer = new ResizeObserver(() => {
      const next = inner.offsetHeight;
      if (next === last) return;
      const from = shellHeight.get() < 0 ? last : shellHeight.get();
      last = next;
      controls?.stop();
      if (reduced || Math.abs(next - from) < SETTLED_HEIGHT_DELTA_PX) { settle(); return; }
      shellHeight.jump(from);
      shell.dataset.easing = "";
      controls = animate(shellHeight, next, { ...SPRING_PANEL, onComplete: settle });
    });
    observer.observe(inner);
    return () => { observer.disconnect(); controls?.stop(); };
  }, [reduced, shellHeight]);

  return <Tag className={[styles.SkeletonMorph, className].filter(Boolean).join(" ")} aria-busy={loading || undefined}>
    <span className={styles.SkeletonMorph__status} role="status">{loading ? loadingLabel : ""}</span>
    <motion.div ref={shellRef} className={styles.SkeletonMorph__shell} style={{ height }}>
      <div ref={innerRef} className={styles.SkeletonMorph__inner}>
        <MorphContext.Provider value={value}>{children}</MorphContext.Provider>
      </div>
    </motion.div>
  </Tag>;
}

/**
 * @param props - Content, skeleton size and element.
 * @returns A size-matched skeleton while loading that stretches onto the content's box and fades as the content sharpens in.
 */
export function MorphBlock({ children, width = "100%", height, radius = SKELETON_MORPH_DEFAULT.radiusPx, lines, lineHeight = SKELETON_MORPH_DEFAULT.lineHeightPx, as = "div", fill = false, className }: MorphBlockProps) {
  const context = useContext(MorphContext);
  if (!context) throw new Error("MorphBlock:render failed: it must be rendered inside SkeletonMorph");
  const { loading, reduced, stagger, register, order } = context;
  const ref = useRef<HTMLElement>(null);
  const placeholderRef = useRef<HTMLSpanElement>(null);
  useEffect(() => ref.current ? register(ref.current) : undefined, [register]);

  // Each block waits for its turn in reading order. Going back to loading is immediate, so a quick reload never sticks.
  const [resolvedState, setResolved] = useState(!loading);
  if (loading && resolvedState) setResolved(false);
  const resolved = resolvedState && !loading;
  useEffect(() => {
    if (loading) return;
    const delay = reduced ? 0 : order(ref.current) * stagger * MILLISECONDS_PER_SECOND;
    const timer = window.setTimeout(() => setResolved(true), delay);
    return () => window.clearTimeout(timer);
  }, [loading, order, reduced, stagger]);

  const circle = radius === CIRCLE;
  const lineCount = lines ?? 0;
  const skeletonWidth = cssLength(width) ?? "100%";
  const skeletonHeight = cssLength(height) ?? (lineCount ? `${lineCount * lineHeight}px` : SKELETON_MORPH_DEFAULT.skeletonHeight);
  const skeletonBox = useRef({ width: skeletonWidth, height: skeletonHeight });
  useLayoutEffect(() => { skeletonBox.current = { width: skeletonWidth, height: skeletonHeight }; });

  // The placeholder starts at the skeleton box, then stretches to the content's measured box as it fades.
  useLayoutEffect(() => {
    const block = ref.current, placeholder = placeholderRef.current;
    if (!block || !placeholder) return;
    if (!resolved) {
      const controls = animate(placeholder, { width: "100%", height: "100%", x: 0, y: 0, opacity: 1 }, { duration: 0 });
      return () => controls.stop();
    }
    if (reduced) {
      const controls = animate(placeholder, { opacity: [1, 0] }, { duration: MOTION_TIMING.instant });
      return () => controls.stop();
    }
    // The block already has its content size; put the skeleton sizing back for one synchronous read to measure where it came from.
    const to = block.getBoundingClientRect();
    const { width: inlineWidth, height: inlineHeight } = block.style;
    block.dataset.state = BLOCK_STATE.skeleton;
    block.style.width = skeletonBox.current.width;
    block.style.height = skeletonBox.current.height;
    const from = block.getBoundingClientRect();
    block.dataset.state = BLOCK_STATE.content;
    block.style.width = inlineWidth;
    block.style.height = inlineHeight;
    const controls = animate(placeholder, {
      width: [from.width, to.width], height: [from.height, to.height], x: [from.left - to.left, 0], y: [from.top - to.top, 0], opacity: [1, 0],
    }, { width: SPRING_PANEL, height: SPRING_PANEL, x: SPRING_PANEL, y: SPRING_PANEL, opacity: PLACEHOLDER_FADE });
    return () => controls.stop();
  }, [reduced, resolved]);

  const Tag = as as ElementType;
  const sizing: CSSProperties = resolved ? {} : { width: skeletonWidth, height: skeletonHeight };
  const placeholderStyle = { borderRadius: circle ? CIRCLE_RADIUS_PX : lineCount ? 0 : cssLength(radius), "--skeleton-morph-line": `${lineHeight}px` } as CSSProperties;

  return <Tag ref={ref} className={[styles.SkeletonMorph__block, className].filter(Boolean).join(" ")} data-state={resolved ? BLOCK_STATE.content : BLOCK_STATE.skeleton} data-fill={fill || undefined} style={sizing}>
    {resolved && <motion.div className={styles.SkeletonMorph__content}
      initial={reduced ? { opacity: 0 } : { opacity: 0, filter: `blur(${CONTENT_BLUR_PX}px)` }} animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={reduced ? { duration: MOTION_TIMING.instant } : CONTENT_ENTER}>
      {children}
    </motion.div>}
    <span ref={placeholderRef} className={styles.SkeletonMorph__placeholder} aria-hidden="true" data-lines={lineCount || undefined} style={placeholderStyle}>
      {lineCount > 0 && Array.from({ length: lineCount }, (_line, index) => <span key={index} className={styles.SkeletonMorph__line} data-last={index === lineCount - 1 && lineCount > 1 || undefined} />)}
    </span>
  </Tag>;
}
