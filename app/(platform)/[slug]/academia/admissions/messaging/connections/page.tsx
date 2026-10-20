/** Loads the wizard's current own metadata through a single server entrypoint inside its leaf runtime boundary. @module messaging-connections-page */
import {Suspense} from "react";
import {createMessagingConfigurationRequestModule} from "@/src/modules/setup";
import {loadMessagingConnectionsPageState} from "@/src/modules/messaging/infrastructure/composition/messaging-connections-page";
import {AdmissionSettingsPage} from "@/components/academy-admissions/admission-settings-page";
import {MessagingConnectionsContainer} from "./messaging-connections-container";
import Loading from "./loading";
import {admissionPolicyStepHref,readAdmissionSettingsNavigation} from "@/src/modules/academy-admissions/constants/admission-settings-navigation";
import {ADMISSION_POLICY_ENTRY_STEP} from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import {ADMISSION_POLICY_DRAFT_COPY} from "@/src/modules/academy-admissions/constants/admission-policy-browser";

/** @param props - Runtime route values resolved only below this segment's Suspense. @returns Current role-scoped metadata without SDK, keyrings, initialization or an initial browser configuration read. */
async function ConnectionsContent({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const[route,rawQuery]=await Promise.all([params,searchParams]),{navigation,query}=readAdmissionSettingsNavigation(rawQuery),state=await loadMessagingConnectionsPageState({params:route,query},async()=>(await createMessagingConfigurationRequestModule()).createPage()),key=state.kind==="ready"?`${state.slug}:${state.viewerId}`:state.code;
  /** Only the allowlisted return from the rules review adds the way back; it never carries a free URL. */
  const links=navigation.returnTo&&state.kind==="ready"?[{href:admissionPolicyStepHref(state.slug,ADMISSION_POLICY_ENTRY_STEP.review),label:ADMISSION_POLICY_DRAFT_COPY.returnToRules}]:[];
  return<AdmissionSettingsPage page="connections" links={links}><MessagingConnectionsContainer key={key} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework runtime values. @returns An own leaf loading boundary and one current server metadata loader. */
export default function MessagingConnectionsPage(props:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){return<Suspense fallback={<Loading />}><ConnectionsContent {...props} /></Suspense>;}
