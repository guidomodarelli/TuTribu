"use client";
/** Composes one current viewer-scoped list workflow with a transport-free presenter. @module allowlist-container */
import type { AllowlistPageState } from "@/src/modules/academy-admissions/application/results/allowlist-page-state";
import type { AllowlistBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { ReauthenticationIntentBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import { useAllowlistWorkflow } from "@/hooks/use-allowlist-workflow";
import { AllowlistManagement } from "@/components/academy-admissions/allowlist-management";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { ALLOWLIST_BROWSER_PHASE, ALLOWLIST_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/allowlist-browser";

/** @param props - Guarded SSR snapshot and optional owned browser ports. @returns One presenter with deterministic first-render props and explicit actions. */
export function AllowlistContainer({ initialState, client, reauthentication }: { initialState: AllowlistPageState; client?: AllowlistBrowserClient; reauthentication?: ReauthenticationIntentBrowserClient }) {
  const workflow = useAllowlistWorkflow({ initialState, client, reauthentication });
  if (initialState.kind === "unavailable") return <AdmissionRouteError embedded message={initialState.message} reset={() => window.location.reload()} />;
  const busy = workflow.phase === ALLOWLIST_BROWSER_PHASE.checking || workflow.phase === ALLOWLIST_BROWSER_PHASE.reading || workflow.phase === ALLOWLIST_BROWSER_PHASE.writing;
  return <>
    {busy && <p role="status">{workflow.phase === ALLOWLIST_BROWSER_PHASE.writing ? ALLOWLIST_BROWSER_COPY.saving : ALLOWLIST_BROWSER_COPY.reading}</p>}
    {!initialState.contactType && <p role="status">{ALLOWLIST_BROWSER_COPY.noPolicy}</p>}
    <AllowlistManagement items={workflow.page.items} contactType={initialState.contactType} search={workflow.search} status={workflow.status} draft={workflow.draft} confirmed={workflow.confirmed} ready={workflow.ready} busy={busy} writing={workflow.phase === ALLOWLIST_BROWSER_PHASE.writing} privateVisible={workflow.privateVisible} pending={Boolean(workflow.pending)} hasNext={Boolean(workflow.page.nextCursor)} conflict={workflow.conflict} reauthenticationRequired={workflow.reauthenticationRequired} errorMessage={workflow.errorMessage} statusMessage={workflow.statusMessage} fieldError={workflow.fieldError} recoveryHref={workflow.recoveryHref} onSearchChange={workflow.setSearch} onStatusChange={workflow.setStatus} onSearch={() => void workflow.searchEntries()} onNext={() => void workflow.next()} onSelect={workflow.select} onNew={workflow.newEntry} onDraftChange={workflow.changeDraft} onConfirm={workflow.setConfirmed} onSave={() => void workflow.save()} onReadOriginal={() => void workflow.readOriginal()} onReadCurrentEntry={() => void workflow.readCurrentEntry()} onReauthenticate={() => void workflow.reauthenticate()} />
  </>;
}
