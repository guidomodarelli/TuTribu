"use client";
/** Restores keyboard context only when an explicit action removes its focused control. */
import { useCallback, useLayoutEffect, useRef, useState } from "react";

type ActionFocusOrigin = { element: HTMLElement; scopeKey: string; resultKey: string; completed: boolean };

/**
 * @param options - Current visible account/tenant scope and confirmed resource state.
 * @returns A result ref and explicit action lifecycle callbacks; background reads never capture focus.
 */
export function useReplacedActionFocus({ scopeKey, resultKey, enabled }: { scopeKey: string; resultKey: string; enabled: boolean }) {
  const resultRef = useRef<HTMLParagraphElement>(null), origin = useRef<ActionFocusOrigin | null>(null);
  const [completionRevision, setCompletionRevision] = useState(0);
  const captureActionFocus = useCallback(() => {
    const element = document.activeElement;
    origin.current = enabled && element instanceof HTMLElement && element !== document.body && element !== document.documentElement
      ? { element, scopeKey, resultKey, completed: false } : null;
  }, [enabled, scopeKey, resultKey]);
  const finishActionFocus = useCallback(() => {
    if (!origin.current) return;
    origin.current.completed = true;
    setCompletionRevision((revision) => revision + 1);
  }, []);

  useLayoutEffect(() => {
    const captured = origin.current;
    if (!captured) return;
    if (!enabled || captured.scopeKey !== scopeKey) { origin.current = null; return; }
    if (!captured.completed) return;
    origin.current = null;
    if (captured.resultKey === resultKey || captured.element.isConnected) return;
    const active = document.activeElement;
    if (active !== document.body && active !== document.documentElement && active !== captured.element) return;
    if (resultRef.current?.textContent?.trim()) resultRef.current.focus();
  }, [completionRevision, enabled, resultKey, scopeKey]);
  useLayoutEffect(() => () => { origin.current = null; }, []);
  return { resultRef, captureActionFocus, finishActionFocus };
}
