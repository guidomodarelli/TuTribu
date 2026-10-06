"use client";

/** Owns browser requests while preserving the safe server snapshot for the first render. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ReauthenticationStatus } from "@/components/auth/reauthentication-status";
import type { ReauthenticationBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-browser-client";
import type { ReauthenticationPageState } from "@/src/modules/auth/application/results/reauthentication-page-result";
import { GLOBAL_REAUTHENTICATION_INTENT_STATE, RECENT_AUTHENTICATION_WINDOW_MS } from "@/src/modules/auth/constants/recent-authentication";
import { REAUTHENTICATION_ERROR_CODE, REAUTHENTICATION_ERROR_MESSAGE, REAUTHENTICATION_INTENT_MESSAGE, REAUTHENTICATION_INTENT_OUTCOME } from "@/src/modules/auth/constants/reauthentication-intents";
import { REAUTHENTICATION_PAGE_SHOW_EVENT, REAUTHENTICATION_UI_COPY, REAUTHENTICATION_UI_PHASE } from "@/src/modules/auth/constants/reauthentication-ui";
import { reauthenticationBrowserClient } from "@/src/modules/auth/infrastructure/reauthentication-browser-client";

/**
 * Starts only on confirmation, reconciles reads without refreshing the route and aborts on teardown.
 * @param props - Validated SSR state and the route-owned transport port.
 * @returns The presentational status screen, without exporting identity or permissions.
 */
export function ReauthenticationContainer({ initialState, client = reauthenticationBrowserClient }: { initialState: ReauthenticationPageState; client?: ReauthenticationBrowserClient }) {
  const [state, setState] = useState(initialState);
  const [phase, setPhase] = useState<typeof REAUTHENTICATION_UI_PHASE[keyof typeof REAUTHENTICATION_UI_PHASE]>(REAUTHENTICATION_UI_PHASE.idle);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialState.kind === "ready" && initialState.oauthFailed ? REAUTHENTICATION_UI_COPY.oauthFailed : null);
  const [startBlocked, setStartBlocked] = useState(initialState.kind === "ready" && initialState.oauthFailed);
  const active = useRef(false);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const currentState = useRef(initialState);

  /** Updates the view and the async reader together without replacing its lifecycle listener. */
  const applyState = useCallback((nextState: ReauthenticationPageState) => {
    currentState.current = nextState;
    setState(nextState);
  }, []);

  const readStatus = useCallback(async (restored = false) => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || (busy.current && !restored)) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    busy.current = true;
    setErrorMessage(null);
    setPhase(REAUTHENTICATION_UI_PHASE.checking);
    const result = await client.read(snapshot.intent.intentId, controller.signal);
    if (!active.current || controller.signal.aborted || request.current !== controller) return;
    busy.current = false;
    setPhase(REAUTHENTICATION_UI_PHASE.idle);
    if (result.status === "ready") {
      const expired = result.intent.outcome === REAUTHENTICATION_INTENT_OUTCOME.verified && (!result.intent.validUntil || Date.parse(result.intent.validUntil) <= Date.now());
      applyState({ kind: "ready", intent: expired ? { ...result.intent, outcome: REAUTHENTICATION_INTENT_OUTCOME.required, safeMessage: REAUTHENTICATION_INTENT_MESSAGE.required } : result.intent, oauthFailed: false });
      setStartBlocked(false);
    }
    else if (result.status === "failed") {
      if ([REAUTHENTICATION_ERROR_CODE.notAuthenticated, REAUTHENTICATION_ERROR_CODE.contextUnavailable, REAUTHENTICATION_ERROR_CODE.notFound].some((code) => code === result.code)) applyState({ kind: "unavailable", code: result.code, message: REAUTHENTICATION_ERROR_MESSAGE[result.code] });
      else setErrorMessage(REAUTHENTICATION_UI_COPY.readFailed);
    }
  }, [client, applyState]);

  useEffect(() => {
    active.current = true;
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void readStatus(true); };
    window.addEventListener(REAUTHENTICATION_PAGE_SHOW_EVENT, onPageShow);
    return () => {
      active.current = false;
      request.current?.abort();
      window.removeEventListener(REAUTHENTICATION_PAGE_SHOW_EVENT, onPageShow);
    };
  }, [readStatus]);

  useEffect(() => {
    const lifecycle = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (state.kind === "ready" && state.intent.outcome === REAUTHENTICATION_INTENT_OUTCOME.verified) {
      const delay = Math.max(0, Math.min(RECENT_AUTHENTICATION_WINDOW_MS, Date.parse(state.intent.validUntil ?? "") - Date.now()));
      timer = setTimeout(() => {
        if (lifecycle.signal.aborted) return;
        applyState({ ...state, intent: { ...state.intent, outcome: REAUTHENTICATION_INTENT_OUTCOME.required, safeMessage: REAUTHENTICATION_INTENT_MESSAGE.required } });
        void readStatus(true);
      }, Number.isFinite(delay) ? delay : 0);
    }
    return () => { lifecycle.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, [state, applyState, readStatus]);

  const start = async () => {
    if (busy.current || startBlocked || state.kind !== "ready" || state.intent.state !== GLOBAL_REAUTHENTICATION_INTENT_STATE.created || state.intent.outcome !== REAUTHENTICATION_INTENT_OUTCOME.pending) return;
    const controller = new AbortController();
    request.current = controller;
    busy.current = true;
    setErrorMessage(null);
    setPhase(REAUTHENTICATION_UI_PHASE.redirecting);
    const result = await client.start(state.intent.intentId, controller.signal);
    if (!active.current || controller.signal.aborted || request.current !== controller) return;
    if (result.status === "started") return;
    busy.current = false;
    setPhase(REAUTHENTICATION_UI_PHASE.idle);
    if (result.status === "failed") {
      setStartBlocked(true);
      setErrorMessage(REAUTHENTICATION_UI_COPY.startFailed);
    }
  };

  return <ReauthenticationStatus state={state} phase={phase} errorMessage={errorMessage} startBlocked={startBlocked} onStart={() => { void start(); }} onRead={() => { void readStatus(); }} />;
}
