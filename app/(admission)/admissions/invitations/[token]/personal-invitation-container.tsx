"use client";
/** Composes current personal contact and canje workflows; presenters cannot access tokens or adapters. @module personal-invitation-container */
import { useState, type ComponentProps } from "react";
import { useParams } from "next/navigation";
import { Button } from "@golfo/ui";
import { PersonalInvitation } from "@/components/academy-admissions/personal-invitation";
import { ContactVerification } from "@/components/academy-admissions/contact-verification";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { usePersonalInvitation } from "@/hooks/use-personal-invitation";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
import type { PersonalInvitationPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-page-state";
import type { PersonalInvitationBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-browser-client";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import { PERSONAL_INVITATION_BROWSER_ROUTE } from "@/src/modules/academy-admissions/constants/personal-invitation-browser";
import { PERSONAL_INVITATION_UI_COPY, PERSONAL_INVITATION_UI_PHASE } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";
import { PERSONAL_INVITATION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/personal-invitation-overview";
import { ADMISSION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_PHASE } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { buildAdmissionEntryRoute, buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { replaceCurrentPageWithUrl } from "@/lib/browser-navigation";
import { ROUTES } from "@/src/constants/routes";
import { validateBrowserAdmissionWhatsappNumberDraft } from "@/src/modules/academy-admissions/infrastructure/browser/validate-admission-whatsapp-number-draft";
import { getAdmissionWhatsappNumberDraftMessage } from "@/src/modules/academy-admissions/application/results/admission-whatsapp-number-draft-message";

type PersonalContainerProps = { initialState: PersonalInvitationPageState; client?: PersonalInvitationBrowserClient; contactClient?: AdmissionContactBrowserClient };

/** @param props - Safe SSR state and own transport ports. @returns A fresh workflow for the current route/account without adding token material to SSR props. */
export function PersonalInvitationContainer(props: PersonalContainerProps) {
  const { token } = useParams<{ token: string }>();
  if (props.initialState.kind === "unavailable") {
    // Only the TuTribu team can make the platform protect admissions again: reloading would fail the same way.
    const retry = props.initialState.code === ADMISSION_ERROR_CODE.platformSecurityUnavailable ? undefined : () => { window.location.reload(); /* A failed read-only SSR snapshot is retried as a fresh document. */ };
    return <AdmissionRouteError message={props.initialState.message} retry={retry} />;
  }
  const viewer = props.initialState.viewerId;
  return <PersonalInvitationWorkflow key={`${token}:${viewer ?? ""}`} {...props} token={token} />;
}

type PersonalInvitationFlow = ReturnType<typeof usePersonalInvitation>;
type AdmissionContactVerificationState = ReturnType<typeof useAdmissionContactVerification>;
type ContactVerificationProps = ComponentProps<typeof ContactVerification>;

type PersonalInvitationSubmitGate = {
  flow: PersonalInvitationFlow;
  hasPreview: boolean;
  terminal: boolean;
  policy: { requiresAdditionalVerification?: boolean } | null | undefined;
  overviewState: string | undefined;
  contact: AdmissionContactVerificationState;
  contactBusy: boolean;
  phoneReady: boolean;
};

/** @param gate - Workflow, policy and contact facts of the current snapshot. @returns Whether the personal admission command can be sent now. */
function canSubmitPersonalInvitation({ flow, hasPreview, terminal, policy, overviewState, contact, contactBusy, phoneReady }: PersonalInvitationSubmitGate): boolean {
  const overviewAllowsSubmit = overviewState === ADMISSION_OVERVIEW_STATE.available || overviewState === ADMISSION_OVERVIEW_STATE.verificationRequired && contact.proofFresh;
  const contactSettled = !contactBusy && !contact.pending && !contact.recoveryRequired;
  return Boolean(flow.ready && !flow.accountChanged && !flow.hasPending && hasPreview && !terminal && policy && overviewAllowsSubmit && phoneReady && (!policy.requiresAdditionalVerification || contact.proofFresh) && contactSettled);
}

/** @param contact - Contact verification state. @returns Whether a contact operation is running or must be recovered first. */
function isContactVerificationBusy(contact: AdmissionContactVerificationState): boolean {
  return contact.phase !== ADMISSION_CONTACT_PHASE.idle && contact.phase !== ADMISSION_CONTACT_PHASE.uncertain || contact.recoveryRequired && !contact.ready;
}

/** @param contactType - Contact type the policy asks for. @param phone - Phone draft. @param country - Country draft. @returns Whether the phone draft is valid, or no phone is asked for. */
function isPersonalPhoneReady(contactType: string | undefined, phone: string, country: string): boolean {
  const phoneNormalized = contactType === ADMISSION_CONTACT_TYPE.phone ? normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.phone, value: phone, country: country || undefined }) : null;
  return !phoneNormalized || phoneNormalized.status === ADMISSION_CONTACT_NORMALIZATION_STATUS.valid;
}

type PersonalInvitationSubmissionInput = {
  policy: { version: number; contactType?: string };
  whatsappNumber: string | null;
  phone: string;
  country: string;
  contact: AdmissionContactVerificationState;
};

/** @param input - Validated drafts, policy and contact proof. @returns The personal command with only the declared optional fields. */
function buildPersonalInvitationSubmission({ policy, whatsappNumber, phone, country, contact }: PersonalInvitationSubmissionInput) {
  return { expectedPolicyVersion: policy.version, ...(whatsappNumber ? { whatsappNumber } : {}), ...(policy.contactType === ADMISSION_CONTACT_TYPE.phone ? { phone, ...(country ? { country } : {}) } : {}), ...(contact.proofFresh && contact.proof ? { proofId: contact.proof.proofId } : {}) };
}

/** @param unavailable - Whether the policy asks for a verification this snapshot cannot offer. @returns The unavailable notice, or nothing. */
function renderVerificationUnavailable(unavailable: boolean) {
  return unavailable ? <p role="status">{PERSONAL_INVITATION_UI_COPY.verificationUnavailable}</p> : undefined;
}

type PersonalContactVerificationProps = {
  contact: AdmissionContactVerificationState;
  channel: ContactVerificationProps["channel"];
  allowedCountries: ContactVerificationProps["allowedCountries"];
  canUseSmsAlternative: boolean;
  phone: string;
  country: string;
  contactBusy: boolean;
  busy: boolean;
  onPhoneChange: (value: string) => void;
  onCountryChange: (value: string) => void;
};

/** @param props - Contact verification state and the personal contact draft. @returns The contact challenge with its recovery reads. */
function PersonalContactVerification({ contact, channel, allowedCountries, canUseSmsAlternative, phone, country, contactBusy, busy, onPhoneChange, onCountryChange }: PersonalContactVerificationProps) {
  return <>
    <ContactVerification channel={channel} phone={phone} country={country} verificationCode={contact.code} confirmed={contact.confirmed} busy={busy} ready={contact.ready && !contact.recoveryRequired} canIssue={contact.ready && !contact.pending} canVerify={contact.ready && !contact.pending} canResend={contact.ready && !contact.pending} canUseSmsAlternative={canUseSmsAlternative} contactLocked={Boolean(contact.challenge || contact.pending)} allowedCountries={allowedCountries} challenge={contact.delivery && contact.challenge ? { ...contact.challenge, deliveryState: contact.delivery.state } : contact.challenge} challengeUnavailable={contact.challengeUnavailable} requiresReplacement={contact.requiresReplacement} proofReady={contact.proofFresh} proofExpired={Boolean(contact.proof && !contact.proofFresh)} expiresInSeconds={contact.expiresInSeconds} resendInSeconds={contact.resendInSeconds} errorMessage={contact.errorMessage ?? contact.challengeMessage ?? contact.deliveryMessage} feedback={contact.feedback} fieldErrors={contact.fieldErrors}
      onPhoneChange={onPhoneChange} onCountryChange={onCountryChange} onCodeChange={contact.setCode} onConfirm={contact.setConfirmed} onIssue={() => void contact.issue()} onResend={() => void contact.resend()} onVerify={() => void contact.verify()} onUseSmsAlternative={() => void contact.useSmsAlternative()} />
    {(contact.pending || contact.recoveryRequired) && <Button type="button" variant="secondary" disabled={contactBusy} onClick={() => void contact.readOriginal()}>Consultar operación del código</Button>}
    {contact.challenge?.deliveryId && <Button type="button" variant="secondary" disabled={contactBusy} onClick={() => void contact.readDelivery()}>Consultar envío del código</Button>}
  </>;
}

/** @param props - Browser-resolved route token and safe native snapshot. @returns One client owner for contact, confirmation and separate common navigation. */
function PersonalInvitationWorkflow({ initialState, token, client, contactClient }: PersonalContainerProps & { token: string }) {
  const flow = usePersonalInvitation({ initialState, token, client });
  const [phone, setPhone] = useState(""), [country, setCountry] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappValidationError, setWhatsappValidationError] = useState<{ message: string; policyVersion: number } | null>(null);
  const preview = flow.state.kind === "ready" && flow.state.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available ? flow.state.preview : null;
  const page = flow.state.kind === "ready" ? flow.state : null, overview = preview?.overview, policy = overview?.policy;
  const initialPreview = initialState.kind === "ready" && initialState.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available ? initialState.preview.overview : null;
  const options = overview?.verification ?? (initialPreview?.policy?.version === policy?.version ? initialPreview?.verification : undefined);
  const terminal = overview?.state === ADMISSION_OVERVIEW_STATE.pending || overview?.state === ADMISSION_OVERVIEW_STATE.alreadyMember;
  const showContact = Boolean(page?.viewerId && policy?.requiresAdditionalVerification && options && !terminal && !flow.accountChanged && flow.personalScope);
  const contact = useAdmissionContactVerification({ viewerId: page?.viewerId ?? null, slug: overview?.tribe.slug ?? "", requestId: null, requestVersion: null, policyVersion: policy?.version ?? 1, channel: options?.channel ?? MESSAGING_PUBLIC_CHANNEL.email, allowedCountries: options?.allowedCountries ?? [], allowSmsAlternative: options?.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms, phone, country, enabled: showContact && flow.ready && !flow.hasPending, renderedAt: page?.renderedAt ?? "", invitationToken: token, personalScope: flow.personalScope ?? undefined, authorize: flow.authorize, client: contactClient, onProof: () => {}, onApplied: () => {} });
  const contactBusy = isContactVerificationBusy(contact);
  const phoneReady = isPersonalPhoneReady(policy?.contactType, phone, country);
  const canSubmit = canSubmitPersonalInvitation({ flow, hasPreview: Boolean(preview), terminal, policy, overviewState: overview?.state, contact, contactBusy, phoneReady });
  /** Validates only declared group data before delegating the original personal command. */
  const submit = () => {
    if (!canSubmit || !policy) return;
    const whatsapp = policy.contactType === ADMISSION_CONTACT_TYPE.phone ? { valid: true as const, value: null } : validateBrowserAdmissionWhatsappNumberDraft(whatsappNumber, policy.requiresWhatsappNumber ?? false);
    if (!whatsapp.valid) { setWhatsappValidationError({ message: getAdmissionWhatsappNumberDraftMessage(whatsapp), policyVersion: policy.version }); return; }
    setWhatsappValidationError(null);
    void flow.submit(buildPersonalInvitationSubmission({ policy, whatsappNumber: whatsapp.value, phone, country, contact }));
  };
  const returnPath = `${PERSONAL_INVITATION_BROWSER_ROUTE.publicPrefix}/${encodeURIComponent(token)}`, signInHref = buildSignInRedirectUrl(returnPath);
  const verification = showContact && options
    ? <PersonalContactVerification contact={contact} channel={options.channel} allowedCountries={options.allowedCountries} canUseSmsAlternative={options.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms} phone={phone} country={country} contactBusy={contactBusy} busy={contactBusy || flow.phase === PERSONAL_INVITATION_UI_PHASE.submitting}
      onPhoneChange={(value) => { setPhone(value); flow.setConfirmed(false); contact.clearFieldFeedback(); }} onCountryChange={(value) => { setCountry(value); flow.setConfirmed(false); contact.clearFieldFeedback(); }} />
    : renderVerificationUnavailable(Boolean(policy?.requiresAdditionalVerification && !terminal));
  return <PersonalInvitation state={flow.state} ready={flow.ready && !contactBusy && !contact.recoveryRequired} confirmed={flow.confirmed} canSubmit={canSubmit} phase={flow.phase} accountChanged={flow.accountChanged} hasPending={flow.hasPending} errorMessage={flow.errorMessage} feedback={flow.feedback} whatsappNumber={whatsappNumber} whatsappErrorMessage={whatsappValidationError?.policyVersion === policy?.version ? whatsappValidationError?.message ?? null : null} onWhatsappNumberChange={(value) => { setWhatsappNumber(value); setWhatsappValidationError(null); flow.setConfirmed(false); }} signInHref={signInHref} commonHref={overview ? buildAdmissionEntryRoute(overview.tribe.slug) : undefined} ownRequestHref={overview?.request ? buildOwnAdmissionRequestRoute(overview.tribe.slug, overview.request.id) : undefined} academyHref={overview ? ROUTES.tribes.academy(overview.tribe.slug) : undefined} verification={verification}
    onConfirm={flow.setConfirmed} onSubmit={submit} onRead={() => void flow.read(contact.proofFresh ? contact.proof?.proofId : undefined)} onChangeAccount={() => { void flow.changeAccount().then((changed) => { if (changed) replaceCurrentPageWithUrl(signInHref); }); }} onReloadAccount={() => { window.location.reload(); /* An actual account change requires a fresh server snapshot. */ }} />;
}
