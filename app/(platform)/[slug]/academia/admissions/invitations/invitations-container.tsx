"use client";
/** Composes one private management workflow and transport-free presenter. @module invitations-container */
import { usePersonalInvitationManagement } from "@/hooks/use-personal-invitation-management";
import { InvitationManagement } from "@/components/academy-admissions/invitation-management";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import type { PersonalInvitationManagementPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-management-page-state";
import type { PersonalInvitationManagementBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import type { ReauthenticationIntentBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import { PERSONAL_INVITATION_MANAGEMENT_COPY as COPY, PERSONAL_INVITATION_MANAGEMENT_PHASE as PHASE } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";

/** @param props - Safe current SSR snapshot and optional owned browser edges. @returns A viewer-scoped workflow without automatic writes or ordinary route refresh. */
export function InvitationsContainer({ initialState, client, reauthentication }: { initialState: PersonalInvitationManagementPageState; client?: PersonalInvitationManagementBrowserClient; reauthentication?: ReauthenticationIntentBrowserClient }) {
  const workflow = usePersonalInvitationManagement({ initialState, client, reauthentication });
  if (initialState.kind === "unavailable") return <AdmissionRouteError embedded message={initialState.message} reset={() => window.location.reload()} />;
  if (!workflow.state || !workflow.draft) return null;
  const busy = workflow.phase === PHASE.checking || workflow.phase === PHASE.reading || workflow.phase === PHASE.writing;
  return <>{busy && <p role="status">{workflow.phase === PHASE.writing ? COPY.saving : COPY.reading}</p>}<InvitationManagement draft={workflow.draft} items={workflow.state.page.items} contactType={workflow.state.contactType} requiresAdditionalVerification={workflow.state.requiresAdditionalVerification} hasUsableAllowlist={workflow.state.hasUsableAllowlist} allowedCountries={workflow.state.allowedCountries} ready={workflow.ready} busy={busy} privateVisible={workflow.privateVisible} pending={Boolean(workflow.pending)} confirmed={workflow.confirmed} conflict={workflow.conflict} needsCurrent={workflow.needsCurrent} selectionBlocked={workflow.selectionBlocked} onDiscardSelection={workflow.discardSelection} hasNext={Boolean(workflow.state.page.nextCursor)} errorMessage={workflow.errorMessage} fieldError={workflow.fieldError} statusMessage={workflow.statusMessage} invitationUrl={workflow.invitationUrl} reauthenticationRequired={workflow.reauthenticationRequired} recoveryHref={workflow.recoveryHref} onDraftChange={workflow.changeDraft} onConfirm={workflow.setConfirmed} onSave={() => void workflow.save()} onSelect={workflow.select} onNew={workflow.newInvitation} onReadOriginal={() => void workflow.readOriginal()} onReadCurrent={() => void workflow.readCurrent()} onNext={() => void workflow.readCurrent({ ...workflow.state!.query, cursor: workflow.state!.page.nextCursor! })} onReauthenticate={() => void workflow.reauthenticate()} onHideUrl={workflow.hideUrl} onCopyUrl={() => void workflow.copyUrl()} /></>;
}
