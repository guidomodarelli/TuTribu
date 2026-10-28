"use client";
/** Owns the commercial membership review reads, decisions and original recovery for the rules flow; the presenter has no transport. @module use-commercial-membership-review */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "@golfo/ui";
import type { CommercialMembershipReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/commercial-membership-review-browser-client";
import { type CommercialMembershipResolutionResult, type CommercialMembershipReviewList, commercialMembershipExpectedState  } from "@/src/modules/academy-admissions/domain/entities/commercial-membership-review";
import type { CommercialMembershipReviewDraft } from "@/components/academy-admissions/commercial-membership-review";
import { COMMERCIAL_MEMBERSHIP_REJECTION_COPY, COMMERCIAL_MEMBERSHIP_REVIEW_COPY as COPY, COMMERCIAL_MEMBERSHIP_REVIEW_OPERATION, COMMERCIAL_MEMBERSHIP_REVIEW_STATUS, commercialMembershipResolvedMessage } from "@/src/modules/academy-admissions/constants/commercial-membership-review";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { readCommercialMembershipReviewIntent, writeCommercialMembershipReviewIntent, type CommercialMembershipReviewIntent } from "@/lib/academy-admissions/commercial-membership-review-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";

/** Read state of the review: the SSR list, a reload in flight, or a failed read with its safe message. */
export type CommercialMembershipReviewPhase = "loading" | "ready" | "failed";
type ReviewOptions = {
  slug: string; viewerId: string; client: CommercialMembershipReviewBrowserClient;
  /** Server-read list, or null when it could not be read for this viewer. */
  initialList: CommercialMembershipReviewList | null;
  initialError: string | null;
  /** Called after a confirmed decision leaves no pending membership. */
  onAllResolved?: () => void;
};

/** Scope, transport, original reference and setters shared by a decision and its recovery. */
type CommercialReviewContext = {
  slug: string; viewerId: string; client: CommercialMembershipReviewBrowserClient; intent: RefObject<CommercialMembershipReviewIntent | null>;
  checkViewer: (signal: AbortSignal) => Promise<boolean>; readList: (signal: AbortSignal) => Promise<CommercialMembershipReviewList | null>;
  applyResult: (pending: CommercialMembershipReviewIntent, result: CommercialMembershipResolutionResult, signal: AbortSignal) => Promise<void>;
  setUncertain: (value: boolean) => void; setErrorMessage: (value: string | null) => void; setStatusMessage: (value: string | null) => void;
};
/** One confirmed decision on a pending membership. */
type CommercialDecision = { memberId: string; item: CommercialMembershipReviewList["cases"][number]; decision: NonNullable<CommercialMembershipReviewDraft["decision"]>; reason: string };

/** @param context - Review scope and setters. @returns Nothing after forgetting the stored original. */
function forgetCommercialIntent(context: CommercialReviewContext): void {
  writeCommercialMembershipReviewIntent(context.viewerId, context.slug, null); context.intent.current = null;
}

/** Reads the original operation of an uncertain decision; it never resends it. @param context - Review scope and setters. @param signal - Current read. @returns Nothing after applying or explaining the original. */
async function recoverCommercialOriginal(context: CommercialReviewContext, signal: AbortSignal): Promise<void> {
  const { slug, client, intent, checkViewer, readList, applyResult, setUncertain, setErrorMessage, setStatusMessage } = context;
  const pending = intent.current;
  if (!pending || !await checkViewer(signal)) return;
  const recovery = await client.operation(slug, pending.input.operationId, signal);
  if (signal.aborted || recovery.status === "aborted") return;
  if (recovery.status === "failed" && recovery.code === ADMISSION_ERROR_CODE.resourceUnavailable) {
    forgetCommercialIntent(context); setUncertain(false);
    setErrorMessage(null); setStatusMessage(COPY.originalMissing); await readList(signal);
    return;
  }
  if (recovery.status === "failed") { setErrorMessage(recovery.message); return; }
  const original = recovery.value;
  if (original.type !== COMMERCIAL_MEMBERSHIP_REVIEW_OPERATION || original.operationId !== pending.input.operationId.toLowerCase()) { setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.publicContractUnusable]); return; }
  if (original.state !== OPERATION_STATE.completed) { setErrorMessage(COPY.uncertain); return; }
  await applyResult(pending, original.result, signal);
}

/** Stores the original before sending one confirmed decision. @param context - Review scope and setters. @param decision - Confirmed decision. @param signal - Current write. @returns Nothing after applying, keeping uncertain or explaining the answer. */
async function submitCommercialDecision(context: CommercialReviewContext, { memberId, item, decision, reason }: CommercialDecision, signal: AbortSignal): Promise<void> {
  const { slug, viewerId, client, intent, checkViewer, applyResult, setUncertain, setErrorMessage, setStatusMessage } = context;
  setStatusMessage(null); setErrorMessage(null);
  if (!await checkViewer(signal)) return;
  const pending: CommercialMembershipReviewIntent = { memberId, memberName: item.displayName?.trim() || COPY.unnamed,
    input: { operationId: newAdmissionOperationId(), confirmed: true, decision, expected: commercialMembershipExpectedState(item), reason: reason.trim() || null } };
  try { writeCommercialMembershipReviewIntent(viewerId, slug, pending); } catch { setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.unexpectedFailure]); return; }
  intent.current = pending;
  const result = await client.resolveCommercialReview(slug, memberId, pending.input, signal);
  if (signal.aborted || result.status === "aborted") return;
  if (result.status === "failed") {
    setErrorMessage(result.message);
    if (result.uncertain) { setUncertain(true); return; }
    forgetCommercialIntent(context);
    return;
  }
  if (result.value.state !== OPERATION_STATE.completed) { setUncertain(true); setErrorMessage(COPY.uncertain); return; }
  await applyResult(pending, result.value.result, signal);
}

/**
 * @param options - Viewer scope, transport port and the server-read list.
 * @returns Current review state and its actions for the presenter.
 */
export function useCommercialMembershipReview({ slug, viewerId, client, initialList, initialError, onAllResolved }: ReviewOptions) {
  const [list, setList] = useState<CommercialMembershipReviewList | null>(initialList);
  const [phase, setPhase] = useState<CommercialMembershipReviewPhase>(initialList ? "ready" : "failed");
  const [drafts, setDrafts] = useState<Record<string, CommercialMembershipReviewDraft>>({});
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null), [inFlight, setInFlight] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialList ? null : initialError);
  const [resolvedThisSession, setResolvedThisSession] = useState(0);
  const busy = useRef(false), controller = useRef<AbortController | null>(null), intent = useRef<CommercialMembershipReviewIntent | null>(null);
  const allResolved = useRef(onAllResolved);
  useEffect(() => { allResolved.current = onAllResolved; }, [onAllResolved]);

  /** Confirms the native account before reading private data or accepting a response. */
  const checkViewer = useCallback(async (signal: AbortSignal) => {
    const viewer = await client.viewer(signal);
    if (signal.aborted || viewer.status === "aborted") return false;
    if (viewer.status === "failed") { setErrorMessage(viewer.message); return false; }
    if (viewer.value?.id !== viewerId) { setErrorMessage(COPY.changedViewer); return false; }
    return true;
  }, [client, viewerId]);

  /** Rereads the pending cases; a failed read keeps the last list and says why. */
  const readList = useCallback(async (signal: AbortSignal): Promise<CommercialMembershipReviewList | null> => {
    if (!await checkViewer(signal)) return null;
    const current = await client.readCommercialReviews(slug, signal);
    if (signal.aborted || current.status === "aborted") return null;
    if (current.status === "failed") { setPhase("failed"); setErrorMessage(current.message); return null; }
    setList(current.value); setPhase("ready");
    return current.value;
  }, [checkViewer, client, slug]);

  /** Runs one read or write in the single slot; reads never change a write button's label. */
  const run = useCallback(async (memberId: string | null, work: (signal: AbortSignal) => Promise<void>) => {
    if (busy.current) return;
    busy.current = true; controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setPendingMemberId(memberId); setInFlight(true);
    try { await work(current.signal); }
    catch { if (!current.signal.aborted) setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.unexpectedFailure]); }
    finally { if (controller.current === current) { busy.current = false; setPendingMemberId(null); setInFlight(false); } }
  }, []);

  /** Applies one confirmed original result: a decision is announced; a rejection explains why and refreshes the list. */
  const applyResult = useCallback(async (pending: CommercialMembershipReviewIntent, result: CommercialMembershipResolutionResult, signal: AbortSignal) => {
    writeCommercialMembershipReviewIntent(viewerId, slug, null); intent.current = null; setUncertain(false);
    setDrafts((current) => { const next = { ...current }; delete next[pending.memberId]; return next; });
    if (result.status === COMMERCIAL_MEMBERSHIP_REVIEW_STATUS.resolved) {
      const message = commercialMembershipResolvedMessage(pending.memberName);
      setErrorMessage(null); setStatusMessage(message); toast.success(message); setResolvedThisSession((count) => count + 1);
    } else {
      setStatusMessage(null); setErrorMessage(COMMERCIAL_MEMBERSHIP_REJECTION_COPY[result.reason]);
    }
    const current = await readList(signal);
    if (result.status === COMMERCIAL_MEMBERSHIP_REVIEW_STATUS.resolved && current?.pendingCount === 0) allResolved.current?.();
  }, [readList, slug, viewerId]);

  /** Reads the original operation of an uncertain decision; it never resends it. */
  const recoverOriginal = useCallback((signal: AbortSignal) => recoverCommercialOriginal({ slug, viewerId, client, intent, checkViewer, readList, applyResult, setUncertain, setErrorMessage, setStatusMessage }, signal), [applyResult, checkViewer, client, readList, slug, viewerId]);

  /** Restores a decision left uncertain by a previous visit and reads its original result first. */
  useEffect(() => {
    let stored: CommercialMembershipReviewIntent | null;
    try { stored = readCommercialMembershipReviewIntent(viewerId, slug); } catch { stored = null; }
    if (!stored) return;
    intent.current = stored;
    const timer = window.setTimeout(() => { setUncertain(true); void run(null, recoverOriginal); }, 0);
    return () => { window.clearTimeout(timer); controller.current?.abort(); busy.current = false; };
  }, [recoverOriginal, run, slug, viewerId]);

  /** @param memberId - Row whose confirmed decision is saved. */
  const resolve = (memberId: string) => {
    const item = list?.cases.find((candidate) => candidate.memberId === memberId), draft = drafts[memberId];
    if (!item || !draft?.decision || !draft.confirmed || intent.current) return;
    const decision = draft.decision;
    void run(memberId, (signal) => submitCommercialDecision({ slug, viewerId, client, intent, checkViewer, readList, applyResult, setUncertain, setErrorMessage, setStatusMessage }, { memberId, item, decision, reason: draft.reason }, signal));
  };

  return {
    phase, list, drafts, pendingMemberId, uncertain, statusMessage, errorMessage, resolvedThisSession,
    busy: inFlight,
    setDraft: (memberId: string, draft: CommercialMembershipReviewDraft) => { setDrafts((current) => ({ ...current, [memberId]: draft })); setStatusMessage(null); },
    resolve,
    reload: () => {
      void run(null, async (signal) => {
        setErrorMessage(null); setPhase("loading");
        const current = await readList(signal);
        if (!current && !signal.aborted) setPhase((value) => value === "loading" ? "failed" : value);
      });
    },
    readOriginal: () => { void run(null, recoverOriginal); },
  };
}
