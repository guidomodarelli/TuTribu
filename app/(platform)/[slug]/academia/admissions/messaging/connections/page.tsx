/** Loads the wizard's current own metadata through a single server entrypoint inside its leaf runtime boundary. @module messaging-connections-page */
import {Suspense} from "react";
import {createMessagingConfigurationRequestModule} from "@/src/modules/setup";
import {loadMessagingConnectionsPageState} from "@/src/modules/messaging/infrastructure/composition/messaging-connections-page";
import {AdmissionSettingsPage} from "@/components/academy-admissions/admission-settings-page";
import {MessagingConnectionsContainer} from "./messaging-connections-container";
import { ADMISSION_SECTION, ADMISSION_SECTION_AUDIENCE } from "@/src/modules/academy-admissions/constants/admission-sections";
import Loading from "./loading";

/** @param props - Runtime route values resolved only below this segment's Suspense. @returns Current role-scoped metadata without SDK, keyrings, initialization or an initial browser configuration read. */
async function ConnectionsContent({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const[route,query]=await Promise.all([params,searchParams]),state=await loadMessagingConnectionsPageState({params:route,query},async()=>(await createMessagingConfigurationRequestModule()).createPage()),key=state.kind==="ready"?`${state.slug}:${state.viewerId}`:state.code;
  return<AdmissionSettingsPage title="Conexión de mensajería" section={ADMISSION_SECTION.connections} slug={state.kind==="ready"?state.slug:undefined} audience={ADMISSION_SECTION_AUDIENCE.leader}><MessagingConnectionsContainer key={key} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework runtime values. @returns An own leaf loading boundary and one current server metadata loader. */
export default function MessagingConnectionsPage(props:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){return<Suspense fallback={<Loading />}><ConnectionsContent {...props} /></Suspense>;}
