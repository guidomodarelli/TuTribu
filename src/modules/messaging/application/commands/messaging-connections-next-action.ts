/** Projects the single advisory next action of the connection workspace from own metadata, without granting authority or reading providers. @module messaging-connections-next-action */
import type {MessagingConfigurationConnection} from "../results/messaging-configuration-result";
import type {MessagingUsagePolicyStateDto} from "../results/messaging-public-result-schemas";
import type {ConnectionDiagnosticIssueResult} from "../../domain/repositories/connection-diagnostic-issuance";
import {MESSAGING_CAPABILITY_PUBLIC_STATE,MESSAGING_CREDENTIAL_PUBLIC_STATE,MESSAGING_PUBLIC_CHANNEL} from "../../constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_MODE} from "../../constants/messaging-credential-validation";
import {MESSAGING_CONNECTION_STATE} from "../../constants/messaging-connection";
import {MESSAGING_USAGE_POLICY_STATE} from "../../constants/messaging-limits";
import {MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS} from "../../constants/messaging-connection-lifecycle";
import {MESSAGING_CHANNEL_LABEL} from "../../constants/messaging-connection-presentation";
import {MESSAGING_CONNECTIONS_NEXT_ACTION_COPY as COPY,MESSAGING_CONNECTIONS_NEXT_STEP,MESSAGING_CONNECTIONS_STEP_KIND,type MessagingConnectionsNextActionTarget,type MessagingConnectionsNextStep} from "../../constants/messaging-connections-workspace";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";
import type {PlatformSecurityRequirement} from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** Channel vocabulary of the public connection contract. */
export type MessagingConnectionChannel=MessagingConfigurationConnection["capabilities"][number]["channel"];
type ConnectionCapability=MessagingConfigurationConnection["capabilities"][number];

/** One highlighted action: what is missing, why, and where it is resolved. The server still checks every requirement at commit time. */
export type MessagingConnectionsNextAction={
  /** Advisory progress shown by the stepper. */
  step:MessagingConnectionsNextStep;
  title:string;
  reason:string;
  /** Visible label of the single action, or null once nothing is left. */
  action:string|null;
  target:MessagingConnectionsNextActionTarget|null;
  /** Channel to preselect in Pruebas when the action is a test. */
  channel:MessagingConnectionChannel|null;
};

/** Spanish list joining ("Correo, SMS y WhatsApp"). */
const CHANNEL_LIST_FORMAT=new Intl.ListFormat("es",{type:"conjunction"});
/** @param channels - Channels in capability order. @returns Their visible labels joined as a Spanish list. */
const joinChannels=(channels:readonly MessagingConnectionChannel[])=>CHANNEL_LIST_FORMAT.format(channels.map((channel)=>MESSAGING_CHANNEL_LABEL[channel]));

/** @param capability - One projected channel capability. @param nowMs - Observation time. @returns Whether its confirmed test is still inside the activation window. */
export function isMessagingCapabilityFreshlyTested(capability:ConnectionCapability,nowMs:number):boolean{
  if(capability.state!==MESSAGING_CAPABILITY_PUBLIC_STATE.prepared||!capability.testedAt)return false;
  const age=nowMs-Date.parse(capability.testedAt);
  return Number.isFinite(age)&&age>=0&&age<=MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS;
}

/** @param selected - Current selection. @param candidate - Current candidate. @returns Whether the candidate is exactly the selected configuration. */
export const isExactActiveSelection=(selected:MessagingConfigurationConnection|null,candidate:MessagingConfigurationConnection|null)=>Boolean(candidate&&selected?.id===candidate.id&&selected.configurationVersion===candidate.configurationVersion);

/** @param step - Advisory progress. @param copy - Title, reason and action label. @param target - Where it is resolved. @returns An action that opens that place. */
const actionAt=(step:MessagingConnectionsNextStep,copy:{title:string;reason:string;action:string},target:MessagingConnectionsNextActionTarget):MessagingConnectionsNextAction=>({step,...copy,target,channel:null});
/** Targets of the flow steps and the secondary security section. */
const TARGET={key:{kind:"step",step:MESSAGING_CONNECTIONS_STEP_KIND.key},credential:{kind:"step",step:MESSAGING_CONNECTIONS_STEP_KIND.credential},channels:{kind:"step",step:MESSAGING_CONNECTIONS_STEP_KIND.channels},test:{kind:"step",step:MESSAGING_CONNECTIONS_STEP_KIND.test},activation:{kind:"step",step:MESSAGING_CONNECTIONS_STEP_KIND.activation},security:{kind:"security"}} as const satisfies Record<string,MessagingConnectionsNextActionTarget>;

/**
 * Resolves the one action the leader should take next, in the order the server requires: candidate, credential, channels, tests, activation.
 * @param input - The leader's selected connection and candidate, saved usage, the observation time (deterministic on the server render)
 * and what only the TuTribu team can resolve before any write of the page can be protected.
 * @returns The highlighted action with its reason; a prepared channel whose test expired counts as pending again, and a platform
 * requirement blocks every step without offering an action.
 */
export function resolveMessagingConnectionsNextAction(input:{selected:MessagingConfigurationConnection|null;candidate:MessagingConfigurationConnection|null;usage:MessagingUsagePolicyStateDto;observedAt:string;platformRequirement?:PlatformSecurityRequirement|null}):MessagingConnectionsNextAction{
  const{candidate,selected,usage}=input,nowMs=Date.parse(input.observedAt);
  if(input.platformRequirement)return{step:MESSAGING_CONNECTIONS_NEXT_STEP.platformBlocked,...COPY.platformBlocked,action:null,target:null,channel:null};
  // A selection sealed under a previous platform security cannot send anymore: a new key replaces it, even while it reads as active.
  if(!candidate&&selected&&!selected.securityCurrent)return actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.saveCandidate,COPY.securityOutdatedSelected,TARGET.key);
  // Activating clears the candidate slot; an active selection without a new candidate is finished, not waiting for a key.
  if(!candidate)return selected?.state===MESSAGING_CONNECTION_STATE.active?{step:MESSAGING_CONNECTIONS_NEXT_STEP.active,title:COPY.activeTitle,reason:COPY.selectedActiveReason,action:null,target:null,channel:null}:actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.saveCandidate,COPY.saveCandidate,TARGET.key);
  const credentialAction=resolveCandidateCredentialAction(candidate,selected);
  if(credentialAction)return credentialAction;
  const progress=classifyCandidateChannels(candidate,selected,nowMs);
  if(progress.usable.length===0)return actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.prepareChannel,progress.unavailable.length?COPY.unavailableChannels(joinChannels(progress.unavailable)):COPY.noChannel,TARGET.channels);
  return resolvePendingTestAction(progress,usage)??resolveActivationAction({candidate,selected,usage,progress});
}

/**
 * Checks the candidate's lifecycle and credential before any channel work.
 * @returns The action that fixes them, or null when the credential is valid.
 */
function resolveCandidateCredentialAction(candidate:MessagingConfigurationConnection,selected:MessagingConfigurationConnection|null):MessagingConnectionsNextAction|null{
  // Retiring a candidate that is also the selection retires the selection too, so its advice never promises the selection stays.
  if(candidate.state===MESSAGING_CONNECTION_STATE.suspended||candidate.state===MESSAGING_CONNECTION_STATE.disconnected)return actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.activate,candidate.id===selected?.id?COPY.suspendedSelection:COPY.suspendedCandidate,TARGET.security);
  // A key sealed under a previous platform security is not fixed by checking it again: the leader saves it again after retiring this candidate.
  if(!candidate.securityCurrent)return candidate.id===selected?.id?actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.saveCandidate,COPY.securityOutdatedSelection,TARGET.security):actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.saveCandidate,COPY.securityOutdatedCandidate,TARGET.key);
  if(candidate.credentialState===MESSAGING_CREDENTIAL_PUBLIC_STATE.notValidated)return actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.validateCredential,COPY.credentialNotValidated,TARGET.credential);
  // A rejected key is not fixed by checking it again: a separate candidate is retired from Clave, which leaves the selection untouched.
  if(candidate.credentialState===MESSAGING_CREDENTIAL_PUBLIC_STATE.invalid)return actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.validateCredential,candidate.id===selected?.id?COPY.credentialInvalidSelection:COPY.credentialInvalid,candidate.id===selected?.id?TARGET.credential:TARGET.key);
  if(candidate.credentialState!==MESSAGING_CREDENTIAL_PUBLIC_STATE.valid)return actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.validateCredential,COPY.credentialUnavailable,TARGET.credential);
  return null;
}

type CandidateChannelProgress={activeSelection:boolean;stale:MessagingConnectionChannel[];unavailable:MessagingConnectionChannel[];untested:MessagingConnectionChannel[];usable:ConnectionCapability[];verified:MessagingConnectionChannel[]};

/** @returns The candidate's channels split by test progress at the observation time. */
function classifyCandidateChannels(candidate:MessagingConfigurationConnection,selected:MessagingConfigurationConnection|null,nowMs:number):CandidateChannelProgress{
  const unavailable=candidate.capabilities.filter((capability)=>capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.unavailable).map((capability)=>capability.channel);
  const usable=candidate.capabilities.filter((capability)=>capability.state!==MESSAGING_CAPABILITY_PUBLIC_STATE.unavailable);
  // The 24-hour window applies to activating a candidate; the unchanged active selection is not retested daily.
  const activeSelection=isExactActiveSelection(selected,candidate);
  const verified=usable.filter((capability)=>activeSelection?capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.prepared:isMessagingCapabilityFreshlyTested(capability,nowMs)).map((capability)=>capability.channel);
  const untested=usable.filter((capability)=>capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.unprepared).map((capability)=>capability.channel);
  const stale=activeSelection?[]:usable.filter((capability)=>capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.prepared&&!isMessagingCapabilityFreshlyTested(capability,nowMs)).map((capability)=>capability.channel);
  return{activeSelection,stale,unavailable,untested,usable,verified};
}

/** @returns The next channel test to run, or null when every usable channel is proven. */
function resolvePendingTestAction({stale,untested,verified}:CandidateChannelProgress,usage:MessagingUsagePolicyStateDto):MessagingConnectionsNextAction|null{
  const[firstPending]=[...untested,...stale];
  if(!firstPending)return null;
  // Every test consumes the daily code quota, so a pending test first needs Países y cupos saved.
  if(usage.state===MESSAGING_USAGE_POLICY_STATE.notConfigured)return{step:MESSAGING_CONNECTIONS_NEXT_STEP.testChannel,...COPY.usageRequired,target:{kind:"usage"},channel:firstPending};
  const reason=[verified.length?COPY.verified(joinChannels(verified),verified.length>1):"",untested.length?COPY.untested(joinChannels(untested)):"",stale.length?COPY.stale(joinChannels(stale)):""].filter(Boolean).join(" ");
  return{step:MESSAGING_CONNECTIONS_NEXT_STEP.testChannel,title:COPY.testTitle(joinChannels([...untested,...stale])),reason,action:COPY.testAction(MESSAGING_CHANNEL_LABEL[firstPending]),target:TARGET.test,channel:firstPending};
}

/** @returns What still blocks activating a fully tested candidate, or the activation itself. */
function resolveActivationAction({candidate,selected,usage,progress}:{candidate:MessagingConfigurationConnection;selected:MessagingConfigurationConnection|null;usage:MessagingUsagePolicyStateDto;progress:CandidateChannelProgress}):MessagingConnectionsNextAction{
  const{activeSelection,unavailable,verified}=progress;
  // Activation needs every configured channel tested, so an unavailable extra channel is the next thing to fix.
  if(unavailable.length)return actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.prepareChannel,COPY.unavailableChannels(joinChannels(unavailable)),TARGET.channels);
  if(candidate.credentialMode!==MESSAGING_CREDENTIAL_MODE.production)return actionAt(MESSAGING_CONNECTIONS_NEXT_STEP.validateCredential,COPY.productionRequired,TARGET.credential);
  const phone=verified.filter((channel)=>channel!==MESSAGING_PUBLIC_CHANNEL.email);
  if(phone.length&&!usage.policy?.allowedCountries.length)return{step:MESSAGING_CONNECTIONS_NEXT_STEP.activate,...COPY.countries(joinChannels(phone)),target:{kind:"usage"},channel:null};
  if(activeSelection)return{step:MESSAGING_CONNECTIONS_NEXT_STEP.active,title:COPY.activeTitle,reason:COPY.activeReason,action:null,target:null,channel:null};
  const reason=[COPY.activateReason(joinChannels(verified),verified.length>1),selected?COPY.replaces(selected.name):""].filter(Boolean).join(" ");
  return{step:MESSAGING_CONNECTIONS_NEXT_STEP.activate,title:COPY.activateTitle,reason,action:COPY.activateAction,target:TARGET.activation,channel:null};
}

/**
 * A code test is settled once its channel was confirmed at or after the test was issued, by this code or a later one.
 * @param diagnostic - Issued test, possibly restored from an earlier visit.
 * @param candidate - Current candidate metadata.
 * @returns Whether waiting for its code adds nothing because the channel is already proven for this configuration.
 */
export function isMessagingDiagnosticSettled(diagnostic:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>,candidate:MessagingConfigurationConnection|null):boolean{
  if(candidate?.id !== diagnostic.connectionId||candidate.configurationVersion!==diagnostic.connectionVersion)return false;
  const capability=candidate.capabilities.find((entry)=>entry.channel===diagnostic.channel);
  if(capability?.state!==MESSAGING_CAPABILITY_PUBLIC_STATE.prepared||!capability.testedAt)return false;
  const issuedAtMs=Date.parse(diagnostic.resendAllowedAt)-ADMISSION_LIMIT.verificationResendWaitMs;
  return Date.parse(capability.testedAt)>=issuedAtMs;
}
