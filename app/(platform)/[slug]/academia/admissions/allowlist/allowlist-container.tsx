"use client";
/** Composes one current viewer-scoped list workflow with a transport-free presenter. @module allowlist-container */
import type { AllowlistPageState } from "@/src/modules/academy-admissions/application/results/allowlist-page-state";
import type { AllowlistBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import { useAllowlistWorkflow } from "@/hooks/use-allowlist-workflow";
import { AllowlistManagement } from "@/components/academy-admissions/allowlist-management";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { ALLOWLIST_BROWSER_PHASE, ALLOWLIST_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";

/** @param props - Guarded SSR snapshot and optional owned browser ports. @returns One presenter with deterministic first-render props and explicit actions; a write's progress is its own toast. */
export function AllowlistContainer({ initialState, client }: { initialState: AllowlistPageState; client?: AllowlistBrowserClient }) {
  const workflow = useAllowlistWorkflow({ initialState, client });
  if (initialState.kind === "unavailable") return <AdmissionRouteError embedded message={initialState.message} retry={() => window.location.reload()} />;
  // Losing the account or the tribe authority closes the private list; a fresh document is the way back.
  if (workflow.phase === ALLOWLIST_BROWSER_PHASE.changedViewer) return <AdmissionRouteError embedded message={workflow.errorMessage ?? ALLOWLIST_BROWSER_COPY.account} retry={() => window.location.reload()} />;
  const writing = workflow.phase === ALLOWLIST_BROWSER_PHASE.writing;
  const busy = workflow.phase === ALLOWLIST_BROWSER_PHASE.checking || workflow.phase === ALLOWLIST_BROWSER_PHASE.reading || writing;
  return <>
    {/* «Ver más» shows its own progress on its button, below the entries it keeps. */}
    {busy && !writing && !workflow.loadingMore && <p role="status">{ALLOWLIST_BROWSER_COPY.reading}</p>}
    <AllowlistManagement items={workflow.page.items} loadingMore={workflow.loadingMore} moreError={workflow.moreError} contactType={initialState.contactType} policyHref={`/${encodeURIComponent(initialState.slug)}/${ADMISSION_POLICY_SETTINGS_SEGMENT}`} search={workflow.search} status={workflow.status} draft={workflow.draft} confirmed={workflow.confirmed} ready={workflow.ready} busy={busy} writing={writing} privateVisible={workflow.privateVisible} pending={Boolean(workflow.pending)} hasNext={Boolean(workflow.page.nextCursor)} conflict={workflow.conflict} errorMessage={workflow.errorMessage} fieldError={workflow.fieldError} step={workflow.step} onStepChange={workflow.setStep} onSearchChange={workflow.setSearch} onStatusChange={workflow.setStatus} onSearch={() => void workflow.searchEntries()} onNext={() => void workflow.next()} onSelect={workflow.select} onNew={workflow.newEntry} onDraftChange={workflow.changeDraft} onConfirm={workflow.setConfirmed} onSave={() => void workflow.save()} onReadOriginal={() => void workflow.readOriginal()} onReadCurrentEntry={() => void workflow.readCurrentEntry()} />
  </>;
}
