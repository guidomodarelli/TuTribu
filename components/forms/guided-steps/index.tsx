/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the
 * Arc Pro license (https://uiarc.dev/license). Not covered by this project's
 * license; do not redistribute it on its own.
 *
 * Adapted from the Arc "Multi-step form" block: the step is controlled by the
 * owner, the last step runs the owner's asynchronous action through the shared
 * Button `loading` state, copy is in Spanish, styles are a BEM SCSS module and
 * timings come from the motion tokens exported by @golfo/ui. The shell does not
 * spring its height; steps only slide and fade. TuTribu extensions: a step can
 * own a write that must land before it advances, and secondary actions
 * (recoveries, optional reads) stay collapsed under a native disclosure.
 */

"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Button, MOTION_EASE, MOTION_EASE_STANDARD, MOTION_TIMING, SPRING_PANEL, SPRING_POP } from "@golfo/ui";
import styles from "./styles.module.scss";

/** One decision of the guided flow. */
export type GuidedStep = {
  /** Stable key of the step. */
  id: string;
  /** Short title shown in the progress list and as the step legend. */
  title: string;
  /** One sentence that says what this step decides. */
  description?: ReactNode;
  /** Fields of the step; keep their values in the owner's state, since only the active step is rendered. */
  content: ReactNode;
  /** Explains why the person cannot continue yet; when present, Continue is disabled and this text is shown. */
  blockedReason?: string;
  /**
   * A write this step must finish before the flow moves on. Its button replaces Continue; the owner advances
   * `current` once the server confirms it, so a failed or pending write keeps the person on this step.
   */
  action?: GuidedStepsAction;
  /** Optional reads or recoveries of this step, collapsed under a disclosure so the main path keeps one next action. */
  secondary?: ReactNode;
  /** Summary of the collapsed secondary actions; defaults to «Más opciones». */
  secondaryLabel?: string;
};

/** An asynchronous write owned by the container: the button shows its spinner and keeps keyboard focus while `loading`. */
export type GuidedStepsAction = {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onRun: () => void;
};

/** The asynchronous action that the last step runs, owned by the container. */
export type GuidedStepsFinalAction = GuidedStepsAction;

export type GuidedStepsProps = {
  /** Accessible name of the whole flow. */
  label: string;
  steps: readonly GuidedStep[];
  /** Zero-based active step, owned by the caller so it can resume where the person left off. */
  current: number;
  onCurrentChange: (index: number) => void;
  finalAction: GuidedStepsFinalAction;
  /** Disables navigation while a write is in flight. */
  busy?: boolean;
  nextLabel?: string;
  /** Content shown under the actions, such as the saved or error status of the last action. */
  footer?: ReactNode;
};

/** Summary of a collapsed group of secondary actions when the owner does not name it. */
const DEFAULT_SECONDARY_LABEL = "Más opciones";

/**
 * Keeps optional reads and recoveries out of the main path behind a native disclosure.
 *
 * @param props - Summary text and the collapsed actions.
 * @returns A `details` element that keyboard and screen reader users can open like any disclosure.
 */
export function GuidedStepsDisclosure({ summary = DEFAULT_SECONDARY_LABEL, children }: { summary?: string; children: ReactNode }) {
  return (
    <details className={styles.GuidedStepsDisclosure}>
      <summary className={styles.GuidedStepsDisclosure__summary}>{summary}</summary>
      <div className={styles.GuidedStepsDisclosure__content}>{children}</div>
    </details>
  );
}

/** Horizontal travel of a step that enters or leaves, in pixels; enough to show the direction. */
const STEP_SLIDE_DISTANCE_PX = 20;
/** Fraction of the check path drawn when a completed marker appears. */
const CHECK_DRAWN = 1;

const stepVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: STEP_SLIDE_DISTANCE_PX * direction }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: -STEP_SLIDE_DISTANCE_PX * direction, transition: { x: SPRING_PANEL, opacity: { duration: MOTION_TIMING.instant, ease: MOTION_EASE_STANDARD } } }),
};

/**
 * Presents one decision at a time with a numbered progress list, Back and Continue,
 * and the owner's final action on the last step.
 *
 * @param props - Controlled step, steps and the final asynchronous action.
 * @returns A form whose submit advances, or runs the final action on the last step.
 */
export function GuidedSteps({ label, steps, current, onCurrentChange, finalAction, busy = false, nextLabel = "Continuar", footer }: GuidedStepsProps) {
  const reduced = useReducedMotion() ?? false;
  const legendRef = useRef<HTMLLegendElement | null>(null);
  const previous = useRef(current);
  const moved = useRef(false);
  const blockedId = useId();
  const active = Math.min(Math.max(current, 0), Math.max(steps.length - 1, 0));
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (previous.current !== active && moved.current) legendRef.current?.focus();
    previous.current = active;
    moved.current = false;
  }, [active]);

  if (!steps.length) return null;
  const step = steps[active];
  const last = active === steps.length - 1;
  // The last step always runs the flow's final action; an earlier step may own its own write.
  const stepAction = last ? finalAction : step.action;
  const slide = reduced ? { duration: 0 } : { x: SPRING_PANEL, opacity: { duration: MOTION_TIMING.standard, ease: MOTION_EASE } };

  /** Moves to another step and remembers that focus should follow it. */
  const go = (index: number) => { moved.current = true; setDirection(index >= active ? 1 : -1); onCurrentChange(index); };
  /** Enter advances like Continue; a step that owns a write (and the last step) runs it instead, and focus follows the step it opens. */
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || step.blockedReason) return;
    if (stepAction) { if (!stepAction.disabled && !stepAction.loading) { moved.current = true; stepAction.onRun(); } return; }
    go(active + 1);
  };

  return (
    <form className={styles.GuidedSteps} onSubmit={submit} aria-label={label} noValidate>
      <nav className={styles.GuidedSteps__progress} aria-label={`Paso ${active + 1} de ${steps.length}`}>
        <ol className={styles.GuidedSteps__list}>
          {steps.map((item, index) => {
            const complete = index < active;
            const isCurrent = index === active;
            return (
              <li key={item.id} className={`${styles.GuidedSteps__item} ${complete ? styles["GuidedSteps__item--complete"] : ""} ${isCurrent ? styles["GuidedSteps__item--current"] : ""}`} aria-current={isCurrent ? "step" : undefined}>
                <span className={styles.GuidedSteps__marker} aria-hidden="true">
                  <AnimatePresence initial={false} mode="popLayout">
                    {complete
                      ? <motion.svg key="done" className={styles.GuidedSteps__glyph} viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" initial={reduced ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={reduced ? undefined : { opacity: 0, transition: { duration: MOTION_TIMING.instant } }} transition={reduced ? { duration: 0 } : SPRING_POP}>
                          <motion.path d="M4 12.5 9 17.5 20 6.5" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: CHECK_DRAWN }} transition={reduced ? { duration: 0 } : { duration: MOTION_TIMING.standard, ease: MOTION_EASE }} />
                        </motion.svg>
                      : <motion.span key="number" className={styles.GuidedSteps__glyph} initial={reduced ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={reduced ? undefined : { opacity: 0, transition: { duration: MOTION_TIMING.instant } }} transition={reduced ? { duration: 0 } : SPRING_POP}>{index + 1}</motion.span>}
                  </AnimatePresence>
                </span>
                <span className={styles.GuidedSteps__label} data-label={item.title}>{item.title}</span>
              </li>
            );
          })}
        </ol>
        <span className={styles.GuidedSteps__count} aria-hidden="true">Paso {active + 1} de {steps.length}</span>
        <span className={styles.GuidedSteps__srOnly} aria-live="polite">Paso {active + 1} de {steps.length}: {step.title}</span>
      </nav>

      <div className={styles.GuidedSteps__viewport}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.fieldset key={step.id} className={styles.GuidedSteps__step} custom={direction} variants={stepVariants} initial={reduced ? false : "enter"} animate="center" exit={reduced ? undefined : "exit"} transition={slide} disabled={busy}>
            <legend ref={legendRef} tabIndex={-1} className={styles.GuidedSteps__legend}>{step.title}</legend>
            {step.description && <p className={styles.GuidedSteps__description}>{step.description}</p>}
            <div className={styles.GuidedSteps__content}>{step.content}</div>
            {step.secondary && <GuidedStepsDisclosure summary={step.secondaryLabel}>{step.secondary}</GuidedStepsDisclosure>}
          </motion.fieldset>
        </AnimatePresence>
      </div>

      {step.blockedReason && <p id={blockedId} className={styles.GuidedSteps__blocked}>{step.blockedReason}</p>}
      <div className={styles.GuidedSteps__actions}>
        {active > 0 && <Button variant="secondary" size="md" onClick={() => go(active - 1)} disabled={busy}><ArrowLeftIcon aria-hidden="true" />Atrás</Button>}
        {stepAction
          ? <Button type="submit" variant="primary" size="md" loading={stepAction.loading} disabled={stepAction.disabled || Boolean(step.blockedReason) || (busy && !stepAction.loading)} aria-describedby={step.blockedReason ? blockedId : undefined}>{stepAction.label}</Button>
          : <Button type="submit" variant="primary" size="md" disabled={busy || Boolean(step.blockedReason)} aria-describedby={step.blockedReason ? blockedId : undefined}>{nextLabel}<ArrowRightIcon aria-hidden="true" /></Button>}
      </div>
      {footer}
    </form>
  );
}
