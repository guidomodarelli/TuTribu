/** Presents the reviewer search, its filter dialog and the applied filter chips, without performing a read or mutation. @module admission-review-filters */
import { useId, useState, type SubmitEvent } from "react";
import { Button, Input, SearchFilterBar, SearchFilterBarFields, Select } from "@golfo/ui";
import type { AdmissionReviewAppliedFilter, AdmissionReviewDialogField, AdmissionReviewFilterDraft } from "@/lib/academy-admissions/admission-review-filters";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_REVIEW_FILTER_COPY, ADMISSION_REVIEW_FILTER_DATES, ADMISSION_REVIEW_FILTER_GROUPS } from "@/src/modules/academy-admissions/constants/admission-review-filters";
import styles from "./styles.module.scss";

/** Only the route owner may validate, navigate, cancel requests or restore a decision. */
type FilterProps = {
  draft: AdmissionReviewFilterDraft; disabled: boolean; errorMessage: string | null;
  /** Applied dialog filters that differ from the initial pending selection, one chip each; the visible search has none. */
  appliedFilters: readonly AdmissionReviewAppliedFilter[];
  onChange: (field: keyof AdmissionReviewFilterDraft, value: string) => void;
  /** @returns Whether the draft was valid and its navigation started, so the dialog can close. */
  onApply: () => boolean;
  /** @returns Whether the initial pending selection started loading, so the dialog can close. */
  onReset: () => boolean;
  /** Puts the dialog fields back on the applied selection when the reviewer closes it without applying. */
  onDiscard: () => void;
  /** Applies the selection without one chip's filter. */
  onRemoveFilter: (field: AdmissionReviewDialogField) => void;
};

/** @param props - Current edit state and callback-only controls. @returns The search bar, its filter dialog and local validation feedback. */
export function AdmissionReviewFilters(props: FilterProps) {
  const id = useId(), [open, setOpen] = useState(false);
  /** @param action - Container action. @returns Nothing; the dialog closes only once that action started a navigation. */
  const run = (action: () => boolean) => { if (!props.disabled && action()) setOpen(false); };
  /** @param next - Open state the dialog asks for. @returns Nothing; dismissing the dialog drops its unapplied edits. */
  const changeOpen = (next: boolean) => { setOpen(next); if (!next) props.onDiscard(); };
  /** @param event - Dialog form submission. @returns Nothing after applying the whole draft once. */
  const submitDialog = (event: SubmitEvent<HTMLFormElement>) => { event.preventDefault(); run(props.onApply); };
  return <section className={styles.AdmissionReviewFilters} aria-labelledby={`${id}-title`}>
    <div className={styles.AdmissionReviewFilters__heading}><h2 id={`${id}-title`} className={styles.AdmissionReviewFilters__title}>{ADMISSION_REVIEW_FILTER_COPY.title}</h2><p className={styles.AdmissionReviewFilters__help}>{ADMISSION_REVIEW_FILTER_COPY.description}</p></div>
    <SearchFilterBar
      searchValue={props.draft.search} onSearchValueChange={(value) => props.onChange("search", value)} onSearchSubmit={() => run(props.onApply)}
      searchPlaceholder={ADMISSION_REVIEW_FILTER_COPY.searchPlaceholder} searchInputProps={{ id: `${id}-search`, maxLength: ADMISSION_QUERY_LIMIT.searchCharacters }}
      labels={{ search: ADMISSION_REVIEW_FILTER_COPY.search, filters: ADMISSION_REVIEW_FILTER_COPY.open, dialogTitle: ADMISSION_REVIEW_FILTER_COPY.dialogTitle }}
      open={open} onOpenChange={changeOpen} disabled={props.disabled}
      appliedFilters={props.appliedFilters} onRemoveFilter={(field) => { const filter = props.appliedFilters.find((applied) => applied.id === field); if (filter) props.onRemoveFilter(filter.id); }}
      dialogDescription={ADMISSION_REVIEW_FILTER_COPY.dialogDescription}
      dialogFooter={<>
        <Button type="button" variant="secondary" disabled={props.disabled} onClick={() => run(props.onReset)}>{ADMISSION_REVIEW_FILTER_COPY.reset}</Button>
        <Button type="submit" form={`${id}-dialog`} disabled={props.disabled}>{ADMISSION_REVIEW_FILTER_COPY.apply}</Button>
      </>}>
      <form id={`${id}-dialog`} className={styles.AdmissionReviewFilters__fields} onSubmit={submitDialog}>
        <SearchFilterBarFields>
          {ADMISSION_REVIEW_FILTER_GROUPS.map((group) => <Select key={group.field} value={props.draft[group.field]} disabled={props.disabled} onValueChange={(value) => props.onChange(group.field, value)} id={`${id}-${group.field}`} triggerClassName={styles.AdmissionReviewFilters__control} label={group.label} options={group.options} />)}
          {ADMISSION_REVIEW_FILTER_DATES.map((field) => <Input key={field.field} label={field.label} id={`${id}-${field.field}`} type="datetime-local" step="any" value={props.draft[field.field]} placeholder={ADMISSION_REVIEW_FILTER_COPY.datePlaceholder} disabled={props.disabled} aria-describedby={`${id}-date-help`} onChange={(event) => props.onChange(field.field, event.target.value)} />)}
        </SearchFilterBarFields>
        <p id={`${id}-date-help`} className={styles.AdmissionReviewFilters__help}>{ADMISSION_REVIEW_FILTER_COPY.dateHelp}</p>
        {props.errorMessage && <p className={styles.AdmissionReviewFilters__error} role="alert">{props.errorMessage}</p>}
      </form>
    </SearchFilterBar>
    {props.errorMessage && !open && <p className={styles.AdmissionReviewFilters__error} role="alert">{props.errorMessage}</p>}
  </section>;
}
