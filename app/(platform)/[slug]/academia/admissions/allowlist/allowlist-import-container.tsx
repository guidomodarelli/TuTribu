"use client";
/** Connects one current scoped CSV workflow to a transport-free presenter. @module allowlist-import-container */
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { ReauthenticationIntentBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import { useAllowlistImportWorkflow } from "@/hooks/use-allowlist-import-workflow";
import { AllowlistImport } from "@/components/academy-admissions/allowlist-import";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** @param props - Guarded minimum current SSR props and own optional collaborators. @returns One controlled import view, without full route refresh after mutations. */
export function AllowlistImportContainer({ initialState, client, reauthentication }: { initialState: AllowlistImportPageState; client?: AllowlistImportBrowserClient; reauthentication?: ReauthenticationIntentBrowserClient }) {
  const workflow = useAllowlistImportWorkflow({ initialState, client, reauthentication });
  if (initialState.kind === "unavailable") return <AdmissionRouteError embedded message={initialState.message} reset={() => window.location.reload()} />;
  const canResume = workflow.pending?.type === REAUTHENTICATION_OPERATION.confirmAllowlistImport && workflow.originalChecked;
  const previous = workflow.unresolved[0], outcomes = new Set(workflow.snapshot?.rows.filter((row) => row.outcome !== undefined).map((row) => row.rowNumber));
  const canReconcile = Boolean(previous && !workflow.pending && workflow.originalChecked && previous.selectedRows.every((number) => outcomes.has(number)));
  return <AllowlistImport ready={workflow.ready} busy={workflow.busy} privateVisible={workflow.privateVisible} initializationFailed={workflow.initializationFailed} onRetryInitialization={workflow.retryInitialization} hasSavedImport={workflow.hasSavedImport} fileName={workflow.draft?.fileName ?? null} contactType={workflow.policy.contactType} snapshot={workflow.snapshot} selection={workflow.selection} confirmed={workflow.confirmed} pending={Boolean(workflow.pending)} canResume={canResume} conflict={workflow.conflict} policyConflict={workflow.policyConflict} unresolvedCount={workflow.unresolved.length} canReconcile={canReconcile} reauthenticationRequired={workflow.reauthenticationRequired} recoveryHref={workflow.recoveryHref} errorMessage={workflow.errorMessage} fieldError={workflow.fieldError} statusMessage={workflow.statusMessage} onFile={(file) => void workflow.upload(file)} onConfirmChange={workflow.setConfirmed} onSelectRow={workflow.selectRow} onPreview={() => void workflow.preview()} onConfirm={() => void workflow.confirm()} onReadOriginal={() => void workflow.readOriginal()} onReadCurrent={() => void workflow.readCurrent()} onReadPolicy={() => void workflow.readPolicy()} onReauthenticate={() => void workflow.reauthenticate()} onTemplate={() => void workflow.download("template")} onReport={() => void workflow.download("report")} onReconcile={() => void workflow.reconcilePrevious()} />;
}
