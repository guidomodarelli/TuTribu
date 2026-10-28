"use client";
/** Lists memberships blocked by payment that need a leader decision, one decision, reason and confirmation per row, without transport. @module commercial-membership-review */
import { useId } from "react";
import { Badge, Button, Checkbox, RadioGroup, Textarea } from "@golfo/ui";
import { type CommercialMembershipReviewCase, type CommercialMembershipReviewList, allowedCommercialMembershipDecisions, classifyCommercialMembershipReview  } from "@/src/modules/academy-admissions/domain/entities/commercial-membership-review";
import {
  COMMERCIAL_MEMBERSHIP_DECISION_COPY, COMMERCIAL_MEMBERSHIP_REASON_MAX_CHARACTERS, COMMERCIAL_MEMBERSHIP_REVIEW_COPY as COPY, COMMERCIAL_MEMBERSHIP_REVIEW_KIND,
  COMMERCIAL_MEMBERSHIP_REVIEW_LABEL as LABEL, type CommercialMembershipDecision,
} from "@/src/modules/academy-admissions/constants/commercial-membership-review";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { getBuenosAiresDateKey } from "@/lib/date-time/buenos-aires-format";
import styles from "./styles.module.scss";

/** The leader's unsaved choice for one row; kept by the container so changing steps never loses it. */
export type CommercialMembershipReviewDraft = { decision: CommercialMembershipDecision | null; reason: string; confirmed: boolean };
export const EMPTY_COMMERCIAL_MEMBERSHIP_REVIEW_DRAFT: CommercialMembershipReviewDraft = { decision: null, reason: "", confirmed: false };

export type CommercialMembershipReviewProps = {
  phase: "loading" | "ready" | "failed";
  list: CommercialMembershipReviewList | null;
  drafts: Readonly<Record<string, CommercialMembershipReviewDraft>>;
  /** Member whose decision is being saved; only its button shows the loading state. */
  pendingMemberId: string | null;
  /** Any read or write in flight: the other write buttons are disabled. */
  busy: boolean;
  /** An uncertain decision waits for its original result before another one is saved. */
  uncertain: boolean;
  statusMessage: string | null; errorMessage: string | null;
  /** Shown once no membership is left to review. */
  doneMessage: string;
  onDraftChange: (memberId: string, draft: CommercialMembershipReviewDraft) => void;
  onResolve: (memberId: string) => void;
  onReload: () => void;
  onReadOriginal: () => void;
};

/** @param iso - Joining instant. @returns The Buenos Aires date as day/month/year, independent of the ICU build. */
function formatJoinedDate(iso: string): string {
  const [year, month, day] = getBuenosAiresDateKey(iso).split("-");
  return `${day}/${month}/${year}`;
}

/** @param item - Listed membership. @returns The decision options with copy for its role. */
function decisionOptions(item: CommercialMembershipReviewCase): { value: CommercialMembershipDecision; label: string }[] {
  const copy: Partial<Record<CommercialMembershipDecision, string>> = item.role === TRIBE_MEMBER_ROLE.guardian ? COMMERCIAL_MEMBERSHIP_DECISION_COPY.guardian : COMMERCIAL_MEMBERSHIP_DECISION_COPY.tribemate;
  return allowedCommercialMembershipDecisions().map((decision) => ({ value: decision, label: copy[decision] ?? decision }));
}

type RowProps = Pick<CommercialMembershipReviewProps, "busy" | "uncertain" | "onDraftChange" | "onResolve"> & { item: CommercialMembershipReviewCase; draft: CommercialMembershipReviewDraft; saving: boolean };

/** @param draft - The row decision draft. @returns What still blocks resolving the row, or null when it can be resolved. */
function rowBlockedReason(draft: CommercialMembershipReviewDraft): string | null {
  if (!draft.decision) return COPY.chooseDecision;
  return draft.confirmed ? null : COPY.confirmRequired;
}

/** @param props - One case, its draft and the row actions. @returns A hairline row with facts, the decision, the optional reason and one confirmed action. */
function ReviewRow({ item, draft, saving, busy, uncertain, onDraftChange, onResolve }: RowProps) {
  const instanceId = useId();
  const name = item.displayName?.trim() || COPY.unnamed;
  const kind = classifyCommercialMembershipReview(item);
  const options = decisionOptions(item);
  const blockedReason = rowBlockedReason(draft);
  const change = (patch: Partial<CommercialMembershipReviewDraft>) => onDraftChange(item.memberId, { ...draft, ...patch });
  return <li className={styles.CommercialMembershipReview__row}>
    <div className={styles.CommercialMembershipReview__rowMain}>
      <h3 className={styles.CommercialMembershipReview__name}>{name}</h3>
      <ul className={styles.CommercialMembershipReview__badges} aria-label={`Estado de ${name}`}>
        <li><Badge tone="warning">{LABEL.status[item.status]}</Badge></li>
        <li><Badge tone="neutral">{LABEL.statusReason[item.statusReason]}</Badge></li>
        <li><Badge tone={kind === COMMERCIAL_MEMBERSHIP_REVIEW_KIND.privileged ? "info" : "neutral"}>{LABEL.kind[kind]}</Badge></li>
      </ul>
      <p className={styles.CommercialMembershipReview__meta}>{`${COPY.joinedAt}: ${formatJoinedDate(item.joinedAt)}`}</p>
    </div>
    <div className={styles.CommercialMembershipReview__decision}>
      <RadioGroup label={COPY.decisionLabel} value={draft.decision ?? ""} options={options.map((option) => ({ ...option, disabled: busy || uncertain }))}
        onValueChange={(value) => { const decision = options.find((option) => option.value === value)?.value; if (decision) change({ decision, confirmed: false }); }} />
      <Textarea id={`${instanceId}-reason`} label={COPY.reasonLabel} description={COPY.reasonDescription} error={undefined} value={draft.reason} maxLength={COMMERCIAL_MEMBERSHIP_REASON_MAX_CHARACTERS} disabled={busy || uncertain} onChange={(event) => change({ reason: event.target.value })} />
      <Checkbox id={`${instanceId}-confirm`} checked={draft.confirmed} disabled={busy || uncertain || !draft.decision} label={COPY.confirm} onCheckedChange={(checked) => change({ confirmed: checked === true })} />
      {blockedReason && <p id={`${instanceId}-blocked`} className={styles.CommercialMembershipReview__hint}>{blockedReason}</p>}
      <div className={styles.CommercialMembershipReview__actions}>
        <Button variant="secondary" loading={saving} disabled={Boolean(blockedReason) || uncertain || (busy && !saving)} aria-describedby={blockedReason ? `${instanceId}-blocked` : undefined} onClick={() => onResolve(item.memberId)}>{COPY.submit}</Button>
      </div>
    </div>
  </li>;
}

/**
 * @param props - Current cases, drafts, write state and container callbacks.
 * @returns The review: a loading or failed read, the pending rows, or the done message.
 */
export function CommercialMembershipReview(props: CommercialMembershipReviewProps) {
  const cases = props.list?.cases ?? [];
  return <div className={styles.CommercialMembershipReview} aria-busy={props.busy}>
    <p className={styles.CommercialMembershipReview__note}>{COPY.prospective}</p>
    {props.statusMessage && <p role="status" className={styles.CommercialMembershipReview__feedback}>{props.statusMessage}</p>}
    {props.errorMessage && <p role="alert" className={`${styles.CommercialMembershipReview__feedback} ${styles["CommercialMembershipReview__feedback--alert"]}`}>{props.errorMessage}</p>}
    {props.uncertain && <div className={styles.CommercialMembershipReview__recovery}>
      <p role="status" className={styles.CommercialMembershipReview__note}>{COPY.uncertain}</p>
      <Button variant="secondary" size="sm" disabled={props.busy} onClick={props.onReadOriginal}>{COPY.readOriginal}</Button>
    </div>}
    {props.phase === "loading" && !props.list && <p role="status" className={styles.CommercialMembershipReview__note}>{COPY.loading}</p>}
    {props.phase === "failed" && <Button variant="secondary" size="sm" disabled={props.busy} onClick={props.onReload}>{COPY.reload}</Button>}
    {props.list && (cases.length > 0
      ? <ul className={styles.CommercialMembershipReview__rows} aria-label={COPY.listLabel}>
        {cases.map((item) => <ReviewRow key={item.memberId} item={item} draft={props.drafts[item.memberId] ?? { decision: null, reason: "", confirmed: false }} saving={props.pendingMemberId === item.memberId}
          busy={props.busy} uncertain={props.uncertain} onDraftChange={props.onDraftChange} onResolve={props.onResolve} />)}
      </ul>
      : <p role="status" className={styles.CommercialMembershipReview__done}>{props.doneMessage}</p>)}
  </div>;
}
