"use client";
/** Rechecks current identity and hides retained facts while restoring a server-authorized history page. @module admission-review-history-container */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdmissionReviewHistoryPageState } from "@/src/modules/academy-admissions/application/results/admission-review-history-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import { AdmissionReviewHistory } from "@/components/academy-admissions/admission-review-history";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { buildAdmissionReviewHistoryReturnRoute, buildAdmissionReviewHistoryRoute } from "@/lib/academy-admissions/admission-review-history-routes";
import { ADMISSION_REVIEW_HISTORY_COPY } from "@/src/modules/academy-admissions/constants/admission-review-history-page";

/** Restored authority requires a fresh server response; ordinary history navigation stays server-first. */
type ReadyHistoryProps = { state: Extract<AdmissionReviewHistoryPageState, { kind: "ready" }>; client: Pick<AdmissionBrowserClient, "viewer"> };

/** @param props - Current owned SSR snapshot and optional own current-viewer transport. @returns A newly scoped history instance or safe recovery, without private application failures. */
export function AdmissionReviewHistoryContainer({ initialState, client = admissionApiClient }: { initialState: AdmissionReviewHistoryPageState; client?: Pick<AdmissionBrowserClient, "viewer"> }) {
  const router = useRouter();
  if (initialState.kind !== "ready") return <AdmissionRouteError embedded message={initialState.message} retry={() => router.refresh()} />;
  return <CurrentHistory key={`${initialState.viewerId}:${initialState.renderedAt}:${initialState.page.admissionRequestId}:${initialState.page.items[0]?.id ?? ""}:${initialState.hasPrevious}`} state={initialState} client={client} />;
}

/** @param props - One immutable native-authorized render. @returns The server history as rendered, with its actions after current-account confirmation; Activity/bfcache restoration withholds it and requests fresh role and resource authority. */
function CurrentHistory({ state, client }: ReadyHistoryProps) {
  const router = useRouter(), [pending, startRefresh] = useTransition();
  const [visible, setVisible] = useState(true), [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasCurrentViewer, setHasCurrentViewer] = useState(false);
  const activated = useRef(false);
  const viewerController = useRef<AbortController | null>(null);
  /** Security restoration is the documented full-route refresh exception: role and resource must be authorized again on the server. */
  const refresh = useCallback(() => { viewerController.current?.abort(); setVisible(false); setErrorMessage(null); startRefresh(() => router.refresh()); }, [router]);

  useLayoutEffect(() => () => setVisible(false), []);
  useEffect(() => {
    const controller = new AbortController();
    viewerController.current = controller;
    // Decided after the commit: a mount that is immediately undone (the development double mount) is aborted before it
    // counts, so only an actual Activity re-show of a consumed history asks the server again.
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      if (activated.current) { refresh(); return; }
      // The server-authorized facts stay on screen while the current viewer is checked; refresh and pagination wait for it, and a failed or different viewer hides them.
      activated.current = true;
      /** @param message - Safe recovery copy. */
      const withhold = (message: string) => { setVisible(false); setErrorMessage(message); };
      try {
        const viewer = await client.viewer(controller.signal);
        if (controller.signal.aborted || viewer.status === "aborted") return;
        if (viewer.status !== "ready") { withhold(ADMISSION_REVIEW_HISTORY_COPY.readFailed); return; }
        if (viewer.value?.id !== state.viewerId) { withhold(ADMISSION_REVIEW_HISTORY_COPY.changedViewer); return; }
        setHasCurrentViewer(true); setVisible(true);
      } catch { if (!controller.signal.aborted) withhold(ADMISSION_REVIEW_HISTORY_COPY.readFailed); }
    });
    /** @param event - Native navigation lifecycle. @returns A fresh server authority check only when a browser document was restored. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    window.addEventListener("pageshow", restored);
    return () => { controller.abort(); if (viewerController.current === controller) viewerController.current = null; window.removeEventListener("pageshow", restored); };
  }, [client, state.viewerId, refresh]);

  const checking = pending || (!visible && errorMessage === null);
  return <AdmissionReviewHistory items={visible ? state.page.items : []} checking={checking} refreshDisabled={!hasCurrentViewer && errorMessage === null} errorMessage={errorMessage}
    backHref={buildAdmissionReviewHistoryReturnRoute(state.slug, state.page.admissionRequestId, state.filters)}
    olderHref={visible && hasCurrentViewer && state.page.nextCursor ? buildAdmissionReviewHistoryRoute(state.slug, state.page.admissionRequestId, state.filters, state.page.nextCursor) : null}
    newestHref={visible && hasCurrentViewer && state.hasPrevious ? buildAdmissionReviewHistoryRoute(state.slug, state.page.admissionRequestId, state.filters) : null}
    onRefresh={refresh} />;
}
