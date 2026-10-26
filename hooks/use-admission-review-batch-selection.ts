"use client";
/** Owns visible batch selection and confirmation without fetching or dispatching decisions. @module use-admission-review-batch-selection */
import { useCallback, useMemo, useRef, useState } from "react";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionBatchReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-intent";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";

/** @returns Render state and stable event actions; refs are accessed only by event/response owners. */
export function useAdmissionReviewBatchSelection() {
  const [selection, setSelection] = useState<AdmissionBatchReviewSelection[]>([]), [confirmed, setConfirmed] = useState(false);
  const current = useRef<AdmissionBatchReviewSelection[]>([]), confirmedSignature = useRef<string | null>(null);
  const resetConfirmation = useCallback(() => { confirmedSignature.current = null; setConfirmed(false); }, []);
  const replace = useCallback((next: AdmissionBatchReviewSelection[]) => { current.current = next; setSelection(next); resetConfirmation(); }, [resetConfirmation]);

  /** @param item - Visible authorized row. @param checked - Explicit user choice. @returns False only when adding another row would exceed the original bound. */
  const toggle = useCallback((item: AdmissionReviewDto, checked: boolean): boolean => {
    const exists = current.current.some((selected) => selected.requestId === item.id);
    if (checked === exists) return true;
    if (checked && current.current.length >= ADMISSION_LIMIT.batchRequestCount) return false;
    replace(checked ? [...current.current, { requestId: item.id, expectedVersion: item.version, applicantName: item.applicant.name }] : current.current.filter((selected) => selected.requestId !== item.id));
    return true;
  }, [replace]);

  /** @param items - Entire currently loaded visible window. @returns Whether a selected row disappeared or changed, requiring a fresh explicit selection. */
  const reconcile = useCallback((items: readonly AdmissionReviewDto[]): boolean => {
    const visible = new Map(items.map((item) => [item.id, item]));
    const next = current.current.filter((selected) => { const item = visible.get(selected.requestId); return item?.status === ADMISSION_REQUEST_STATUS.pending && item.version === selected.expectedVersion && item.applicant.name === selected.applicantName; });
    if (next.length === current.current.length) return false;
    replace(next); return true;
  }, [replace]);

  /** @param value - Explicit checkbox choice. @param original - Original manifest when retrying; otherwise the current visible selection. */
  const confirm = useCallback((value: boolean, original?: readonly AdmissionBatchReviewSelection[]) => { confirmedSignature.current = value ? JSON.stringify(original ?? current.current) : null; setConfirmed(value); }, []);
  /** @param original - Exact manifest proposed for this write. @returns Whether that same manifest was explicitly confirmed, including before another event can render. */
  const isConfirmedFor = useCallback((original: readonly AdmissionBatchReviewSelection[]) => confirmedSignature.current !== null && confirmedSignature.current === JSON.stringify(original), []);
  const clear = useCallback(() => { replace([]); }, [replace]);
  const getSelection = useCallback((): readonly AdmissionBatchReviewSelection[] => current.current, []);
  const actions = useMemo(() => ({ toggle, reconcile, confirm, isConfirmedFor, clear, getSelection, resetConfirmation }), [toggle, reconcile, confirm, isConfirmedFor, clear, getSelection, resetConfirmation]);
  return { selection, confirmed, actions };
}
