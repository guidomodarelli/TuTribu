"use client";
/** Connects one current scoped CSV workflow to a transport-free presenter. @module allowlist-import-container */
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import { useAllowlistImportWorkflow } from "@/hooks/use-allowlist-import-workflow";
import { AllowlistImport } from "@/components/academy-admissions/allowlist-import";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { ALLOWLIST_IMPORT_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";

/** @param props - Guarded minimum current SSR props and own optional collaborators. @returns One controlled import view, without full route refresh after mutations. */
export function AllowlistImportContainer({ initialState, client }: { initialState: AllowlistImportPageState; client?: AllowlistImportBrowserClient }) {
  const workflow = useAllowlistImportWorkflow({ initialState, client });
  if (initialState.kind === "unavailable") return <AdmissionRouteError embedded message={initialState.message} retry={() => window.location.reload()} />;
  // Losing the account or the tribe authority closes the private import; a fresh document is the way back.
  if (workflow.accessLost) return <AdmissionRouteError embedded message={workflow.errorMessage ?? ALLOWLIST_IMPORT_BROWSER_COPY.account} retry={() => window.location.reload()} />;
  const canResume = workflow.pending?.type === REAUTHENTICATION_OPERATION.confirmAllowlistImport && workflow.originalChecked;
  const previous = workflow.unresolved.at(0), outcomes = new Set(workflow.snapshot?.rows.filter((row) => row.outcome !== undefined).map((row) => row.rowNumber));
  const canReconcile = Boolean(previous && !workflow.pending && workflow.originalChecked && previous.selectedRows.every((number) => outcomes.has(number)));
  return <AllowlistImport policyHref={`/${encodeURIComponent(initialState.slug)}/${ADMISSION_POLICY_SETTINGS_SEGMENT}`} platformRequirement={workflow.policy.platformRequirement} originalAbsent={workflow.originalAbsent} onDiscardOriginal={workflow.discardOriginal} ready={workflow.ready} busy={workflow.busy} writeAction={workflow.writeAction} privateVisible={workflow.privateVisible} initializationFailed={workflow.initializationFailed} onRetryInitialization={workflow.retryInitialization} hasSavedImport={workflow.hasSavedImport} fileName={workflow.draft?.fileName ?? null} contactType={workflow.policy.contactType} snapshot={workflow.snapshot} selection={workflow.selection} confirmed={workflow.confirmed} pending={Boolean(workflow.pending)} canResume={canResume} conflict={workflow.conflict} policyConflict={workflow.policyConflict} unresolvedCount={workflow.unresolved.length} canReconcile={canReconcile} errorMessage={workflow.errorMessage} fieldError={workflow.fieldError} statusMessage={workflow.statusMessage} step={workflow.step} onStepChange={workflow.setStep} onFile={(file) => void workflow.upload(file)} onConfirmChange={workflow.setConfirmed} onSelectRow={workflow.selectRow} onSelectAllValid={workflow.selectAllValidRows} onPreview={() => void workflow.preview()} onConfirm={() => void workflow.confirm()} onReadOriginal={() => void workflow.readOriginal()} onReadCurrent={() => void workflow.readCurrent()} onRecheckPlatform={() => void workflow.recheckPlatform()} onReadPolicy={() => void workflow.readPolicy()} onTemplate={() => void workflow.download("template")} onReport={() => void workflow.download("report")} onReconcile={() => void workflow.reconcilePrevious()} />;
}
