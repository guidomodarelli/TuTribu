"use client";
/** Composes one private management workflow and transport-free presenter. @module invitations-container */
import { usePersonalInvitationManagement } from "@/hooks/use-personal-invitation-management";
import { InvitationManagement } from "@/components/academy-admissions/invitation-management";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { resolveAdmissionRouteRecovery } from "@/lib/academy-admissions/admission-route-recovery";
import { useAdmissionRouteLocation } from "@/hooks/use-admission-route-location";
import type { PersonalInvitationManagementPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-management-page-state";
import type { PersonalInvitationManagementBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import { PERSONAL_INVITATION_MANAGEMENT_COPY as COPY, PERSONAL_INVITATION_MANAGEMENT_PHASE as PHASE } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";

/** @param props - Safe current SSR snapshot and optional owned browser edges. @returns A viewer-scoped workflow without automatic writes or ordinary route refresh. */
export function InvitationsContainer({ initialState, client }: { initialState: PersonalInvitationManagementPageState; client?: PersonalInvitationManagementBrowserClient }) {
  const workflow = usePersonalInvitationManagement({ initialState, client }), location = useAdmissionRouteLocation();
  if (initialState.kind === "unavailable") return <AdmissionRouteError embedded message={initialState.message} {...resolveAdmissionRouteRecovery(initialState.code, location)} />;
  // Losing the account or the tribe authority closes the private view; a fresh document is the way back.
  if (workflow.phase === PHASE.closed) return <AdmissionRouteError embedded message={workflow.errorMessage ?? COPY.account} retry={() => window.location.reload()} />;
  if (!workflow.state || !workflow.draft) return null;
  const busy = workflow.phase === PHASE.checking || workflow.phase === PHASE.reading || workflow.phase === PHASE.writing;
  // A write's progress is its own toast and «Ver más» shows it on its button; only other reads keep a status line.
  return <>{busy && workflow.phase !== PHASE.writing && !workflow.loadingMore && <p role="status">{COPY.reading}</p>}<InvitationManagement draft={workflow.draft} items={workflow.state.page.items} loadingMore={workflow.loadingMore} moreError={workflow.moreError} contactType={workflow.state.contactType} platformRequirement={workflow.state.platformRequirement} originalAbsent={workflow.originalAbsent} originalStarted={workflow.originalStarted} onDiscardOriginal={workflow.discardOriginal} requiresAdditionalVerification={workflow.state.requiresAdditionalVerification} hasUsableAllowlist={workflow.state.hasUsableAllowlist} allowedCountries={workflow.state.allowedCountries} ready={workflow.ready} busy={busy} writing={workflow.phase === PHASE.writing} privateVisible={workflow.privateVisible} pending={Boolean(workflow.pending)} confirmed={workflow.confirmed} conflict={workflow.conflict} needsCurrent={workflow.needsCurrent} selectionBlocked={workflow.selectionBlocked} onDiscardSelection={workflow.discardSelection} hasNext={Boolean(workflow.state.page.nextCursor)} errorMessage={workflow.errorMessage} fieldError={workflow.fieldError} statusMessage={workflow.statusMessage} invitationUrl={workflow.invitationUrl} step={workflow.step} onStepChange={workflow.setStep} onDraftChange={workflow.changeDraft} onConfirm={workflow.setConfirmed} onSave={() => void workflow.save()} onSelect={workflow.select} onNew={workflow.newInvitation} onReadOriginal={() => void workflow.readOriginal()} onReadCurrent={() => void workflow.readCurrent()} onNext={() => void workflow.readMore()} onHideUrl={workflow.hideUrl} onCopyUrl={() => void workflow.copyUrl()} /></>;
}
