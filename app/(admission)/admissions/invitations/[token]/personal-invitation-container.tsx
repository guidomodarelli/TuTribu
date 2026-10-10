"use client";
/** Composes current personal contact and canje workflows; presenters cannot access tokens or adapters. @module personal-invitation-container */
import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "beez-ui";
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
import { ADMISSION_CONTACT_PHASE } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { buildAdmissionEntryRoute, buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { replaceCurrentPageWithUrl } from "@/lib/browser-navigation";
import { ROUTES } from "@/src/constants/routes";

type PersonalContainerProps = { initialState: PersonalInvitationPageState; client?: PersonalInvitationBrowserClient; contactClient?: AdmissionContactBrowserClient };

/** @param props - Safe SSR state and own transport ports. @returns A fresh workflow for the current route/account without adding token material to SSR props. */
export function PersonalInvitationContainer(props: PersonalContainerProps) {
  const { token } = useParams<{ token: string }>();
  if (props.initialState.kind === "unavailable") return <AdmissionRouteError message={props.initialState.message} reset={() => { window.location.reload(); /* A failed read-only SSR snapshot is retried as a fresh document. */ }} />;
  const viewer = props.initialState.kind === "ready" ? props.initialState.viewerId : null;
  return <PersonalInvitationWorkflow key={`${token}:${viewer ?? ""}`} {...props} token={token} />;
}

/** @param props - Browser-resolved route token and safe native snapshot. @returns One client owner for contact, confirmation and separate common navigation. */
function PersonalInvitationWorkflow({ initialState, token, client, contactClient }: PersonalContainerProps & { token: string }) {
  const flow = usePersonalInvitation({ initialState, token, client });
  const [phone, setPhone] = useState(""), [country, setCountry] = useState("");
  const preview = flow.state.kind === "ready" && flow.state.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available ? flow.state.preview : null;
  const page = flow.state.kind === "ready" ? flow.state : null, overview = preview?.overview, policy = overview?.policy;
  const initialPreview = initialState.kind === "ready" && initialState.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available ? initialState.preview.overview : null;
  const options = overview?.verification ?? (initialPreview?.policy?.version === policy?.version ? initialPreview?.verification : undefined);
  const terminal = overview?.state === ADMISSION_OVERVIEW_STATE.pending || overview?.state === ADMISSION_OVERVIEW_STATE.alreadyMember;
  const showContact = Boolean(page?.viewerId && policy?.requiresAdditionalVerification && options && !terminal && !flow.accountChanged && flow.personalScope);
  const contact = useAdmissionContactVerification({ viewerId: page?.viewerId ?? null, slug: overview?.tribe.slug ?? "", requestId: null, requestVersion: null, policyVersion: policy?.version ?? 1, channel: options?.channel ?? MESSAGING_PUBLIC_CHANNEL.email, allowedCountries: options?.allowedCountries ?? [], allowSmsAlternative: options?.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms, phone, country, enabled: showContact && flow.ready && !flow.hasPending, renderedAt: page?.renderedAt ?? "", invitationToken: token, personalScope: flow.personalScope ?? undefined, authorize: flow.authorize, client: contactClient, onProof: () => {}, onApplied: () => {} });
  const contactBusy = contact.phase !== ADMISSION_CONTACT_PHASE.idle && contact.phase !== ADMISSION_CONTACT_PHASE.uncertain || contact.recoveryRequired && !contact.ready;
  const phoneNormalized = policy?.contactType === ADMISSION_CONTACT_TYPE.phone ? normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.phone, value: phone, country: country || undefined }) : null;
  const phoneReady = !phoneNormalized || phoneNormalized.status === ADMISSION_CONTACT_NORMALIZATION_STATUS.valid;
  const canSubmit = Boolean(flow.ready && !flow.accountChanged && !flow.hasPending && preview && !terminal && policy && (overview?.state === ADMISSION_OVERVIEW_STATE.available || overview?.state === ADMISSION_OVERVIEW_STATE.verificationRequired && contact.proofFresh) && phoneReady && (!policy.requiresAdditionalVerification || contact.proofFresh) && !contactBusy && !contact.pending && !contact.recoveryRequired);
  const returnPath = `${PERSONAL_INVITATION_BROWSER_ROUTE.publicPrefix}/${encodeURIComponent(token)}`, signInHref = buildSignInRedirectUrl(returnPath);
  const verification = showContact && options ? <>
    <ContactVerification channel={options.channel} phone={phone} country={country} verificationCode={contact.code} confirmed={contact.confirmed} busy={contactBusy || flow.phase === PERSONAL_INVITATION_UI_PHASE.submitting} ready={contact.ready && !contact.recoveryRequired} canIssue={contact.ready && !contact.pending} canVerify={contact.ready && !contact.pending} canResend={contact.ready && !contact.pending} canUseSmsAlternative={options.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms} contactLocked={Boolean(contact.challenge || contact.pending)} allowedCountries={options.allowedCountries} challenge={contact.delivery && contact.challenge ? { ...contact.challenge, deliveryState: contact.delivery.state } : contact.challenge} challengeUnavailable={contact.challengeUnavailable} requiresReplacement={contact.requiresReplacement} proofReady={contact.proofFresh} proofExpired={Boolean(contact.proof && !contact.proofFresh)} expiresInSeconds={contact.expiresInSeconds} resendInSeconds={contact.resendInSeconds} errorMessage={contact.errorMessage ?? contact.challengeMessage ?? contact.deliveryMessage} feedback={contact.feedback} fieldErrors={contact.fieldErrors}
      onPhoneChange={(value) => { setPhone(value); flow.setConfirmed(false); contact.clearFieldFeedback(); }} onCountryChange={(value) => { setCountry(value); flow.setConfirmed(false); contact.clearFieldFeedback(); }} onCodeChange={contact.setCode} onConfirm={contact.setConfirmed} onIssue={() => void contact.issue()} onResend={() => void contact.resend()} onVerify={() => void contact.verify()} onUseSmsAlternative={() => void contact.useSmsAlternative()} />
    {(contact.pending || contact.recoveryRequired) && <Button type="button" variant="outline" disabled={contactBusy} onClick={() => void contact.readOriginal()}>Consultar operación del código</Button>}
    {contact.challenge?.deliveryId && <Button type="button" variant="outline" disabled={contactBusy} onClick={() => void contact.readDelivery()}>Consultar envío del código</Button>}
  </> : policy?.requiresAdditionalVerification && !terminal ? <p role="status">{PERSONAL_INVITATION_UI_COPY.verificationUnavailable}</p> : undefined;
  return <PersonalInvitation state={flow.state} ready={flow.ready && !contactBusy && !contact.recoveryRequired} confirmed={flow.confirmed} canSubmit={canSubmit} phase={flow.phase} accountChanged={flow.accountChanged} hasPending={flow.hasPending} errorMessage={flow.errorMessage} feedback={flow.feedback} signInHref={signInHref} commonHref={overview ? buildAdmissionEntryRoute(overview.tribe.slug) : undefined} ownRequestHref={overview?.request ? buildOwnAdmissionRequestRoute(overview.tribe.slug, overview.request.id) : undefined} academyHref={overview ? ROUTES.tribes.academy(overview.tribe.slug) : undefined} verification={verification}
    onConfirm={flow.setConfirmed} onSubmit={() => { if (canSubmit && policy) void flow.submit({ expectedPolicyVersion: policy.version, ...(policy.contactType === ADMISSION_CONTACT_TYPE.phone ? { phone, ...(country ? { country } : {}) } : {}), ...(contact.proofFresh && contact.proof ? { proofId: contact.proof.proofId } : {}) }); }} onRead={() => void flow.read(contact.proofFresh ? contact.proof?.proofId : undefined)} onChangeAccount={() => { void flow.changeAccount().then((changed) => { if (changed) replaceCurrentPageWithUrl(signInHref); }); }} onReloadAccount={() => { window.location.reload(); /* An actual account change requires a fresh server snapshot. */ }} />;
}
