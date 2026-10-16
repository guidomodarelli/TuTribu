/** Presents explicit reviewer search/filter navigation without performing a read or mutation. @module admission-review-filters */
import { useId } from "react";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@guidomodarelli/beez-ui";
import type { AdmissionReviewFilterDraft } from "@/lib/academy-admissions/admission-review-filters";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_REVIEW_FILTER_COPY, ADMISSION_REVIEW_FILTER_DATES, ADMISSION_REVIEW_FILTER_GROUPS } from "@/src/modules/academy-admissions/constants/admission-review-filters";
import styles from "./styles.module.scss";

/** Only the route owner may validate, navigate, cancel requests or restore a decision. */
type FilterProps = { draft: AdmissionReviewFilterDraft; disabled: boolean; errorMessage: string | null; onChange: (field: keyof AdmissionReviewFilterDraft, value: string) => void; onApply: () => void; onReset: () => void };

/** @param props - Current edit state and callback-only controls. @returns A labeled responsive filter form with local validation feedback. */
export function AdmissionReviewFilters(props: FilterProps) {
  const id = useId();
  return <form className={styles.AdmissionReviewFilters} aria-labelledby={`${id}-title`} onSubmit={(event) => { event.preventDefault(); if (!props.disabled) props.onApply(); }}>
    <div className={styles.AdmissionReviewFilters__heading}><h2 id={`${id}-title`} className={styles.AdmissionReviewFilters__title}>{ADMISSION_REVIEW_FILTER_COPY.title}</h2><p className={styles.AdmissionReviewFilters__help}>{ADMISSION_REVIEW_FILTER_COPY.description}</p></div>
    <div className={styles.AdmissionReviewFilters__fields}>
      <div className={styles.AdmissionReviewFilters__field}><label htmlFor={`${id}-search`}>{ADMISSION_REVIEW_FILTER_COPY.search}</label><Input id={`${id}-search`} type="search" value={props.draft.search} maxLength={ADMISSION_QUERY_LIMIT.searchCharacters} disabled={props.disabled} onChange={(event) => props.onChange("search", event.target.value)} /></div>
      {ADMISSION_REVIEW_FILTER_GROUPS.map((group) => <div className={styles.AdmissionReviewFilters__field} key={group.field}><label htmlFor={`${id}-${group.field}`}>{group.label}</label><Select value={props.draft[group.field]} disabled={props.disabled} onValueChange={(value) => props.onChange(group.field, value)}><SelectTrigger id={`${id}-${group.field}`} className={styles.AdmissionReviewFilters__control}><SelectValue /></SelectTrigger><SelectContent>{group.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>)}
      {ADMISSION_REVIEW_FILTER_DATES.map((field) => <div className={styles.AdmissionReviewFilters__field} key={field.field}><label htmlFor={`${id}-${field.field}`}>{field.label}</label><Input id={`${id}-${field.field}`} type="datetime-local" step="any" value={props.draft[field.field]} placeholder={ADMISSION_REVIEW_FILTER_COPY.datePlaceholder} disabled={props.disabled} aria-describedby={`${id}-date-help`} onChange={(event) => props.onChange(field.field, event.target.value)} /></div>)}
    </div>
    <p id={`${id}-date-help`} className={styles.AdmissionReviewFilters__help}>{ADMISSION_REVIEW_FILTER_COPY.dateHelp}</p>
    {props.errorMessage && <p className={styles.AdmissionReviewFilters__error} role="alert">{props.errorMessage}</p>}
    <div className={styles.AdmissionReviewFilters__actions}><Button type="submit" disabled={props.disabled}>{ADMISSION_REVIEW_FILTER_COPY.apply}</Button><Button type="button" variant="outline" disabled={props.disabled} onClick={props.onReset}>{ADMISSION_REVIEW_FILTER_COPY.reset}</Button></div>
  </form>;
}
