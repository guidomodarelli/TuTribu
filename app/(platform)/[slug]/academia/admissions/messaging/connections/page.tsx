/** Loads the wizard's current own metadata through a single server entrypoint inside its leaf runtime boundary. @module messaging-connections-page */
import {Suspense} from "react";
import {createMessagingConfigurationRequestModule} from "@/src/modules/setup";
import {loadMessagingConnectionsPageState} from "@/src/modules/messaging/infrastructure/composition/messaging-connections-page";
import {AdmissionSettingsPage} from "@/components/academy-admissions/admission-settings-page";
import {MESSAGING_USAGE_SETTINGS_SEGMENT} from "@/src/modules/messaging/constants/messaging-usage";
import {MessagingConnectionsContainer} from "./messaging-connections-container";
import Loading from "./loading";

/** @param props - Runtime route values resolved only below this segment's Suspense. @returns Current role-scoped metadata without SDK, keyrings, initialization or an initial browser configuration read. */
async function ConnectionsContent({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const[route,query]=await Promise.all([params,searchParams]),state=await loadMessagingConnectionsPageState({params:route,query},async()=>(await createMessagingConfigurationRequestModule()).createPage()),key=state.kind==="ready"?`${state.slug}:${state.viewerId}`:state.code;
  return<AdmissionSettingsPage title="Conexión de mensajería" links={state.kind==="ready"?[{href:`/${encodeURIComponent(state.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`,label:"Volver a países y cupos"}]:[]}><MessagingConnectionsContainer key={key} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework runtime values. @returns An own leaf loading boundary and one current server metadata loader. */
export default function MessagingConnectionsPage(props:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){return<Suspense fallback={<Loading />}><ConnectionsContent {...props} /></Suspense>;}
