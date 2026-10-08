/** Installs only an owned synthetic provider HTTP boundary before the actual Next/SDK runtime. @module native-zavu-provider-transport */
import {randomUUID} from "node:crypto";

/** Retains native fetch for framework requests; provider traffic is restricted below. */
const nativeFetch=globalThis.fetch;
/** Marks only safe provider request counts on the owned child process channel. */
const PROVIDER_REQUEST_NOTICE="admission_test_provider_request";
/** Names the fixed pinned-provider origin and credential-read operation. */
const PROVIDER_ORIGIN="https://api.zavu.dev",CREDENTIAL_PATH="/v1/me";
/** Resource fixtures are enabled explicitly by the owned read-only integration test. */
const RESOURCE_PATH={senders:"/v1/senders",templates:"/v1/templates"},RESOURCE_CURSOR="synthetic-private-continuation",RESOURCE_ID={sender:process.env.ADMISSION_TEST_ZAVU_SENDER_ID??randomUUID(),template:randomUUID()};
/** Requires private synthetic setup in the test helper, never a fallback application key. */
const syntheticCredential=process.env.ADMISSION_TEST_ZAVU_CREDENTIAL;
if(!syntheticCredential)throw new Error("NativeZavuProviderTransport failed: synthetic_credential_missing");
/** Only the owned loopback framework origin may use native fetch; every external HTTP path is closed. */
const frameworkOrigin=new URL(process.env.BETTER_AUTH_URL).origin;
/** Collects only the existing boundary's allowlisted diagnostic stage/code, never raw console payloads or causes. */
const nativeConsoleError=console.error,dispatchStages=new Set(["claim","authorize","send","complete","late","defer"]),dispatchCodes=new Set(["invalid_input","permission_denied","resource_unavailable","connection_incomplete","operation_unresolved","unexpected_failure","transport_timeout","dependency_unavailable"]);
console.error=(...argumentsList)=>{
  if(argumentsList.length===1&&typeof argumentsList[0]==="string"){
    let entry;try{entry=JSON.parse(argumentsList[0]);}catch{entry=null;}
    if(entry?.feature==="messaging"&&entry.operation==="diagnose_messaging_connection"&&entry.message==="Connection diagnostic dispatch failed"&&dispatchStages.has(entry.metadata?.stage)&&dispatchCodes.has(entry.metadata?.code))process.send?.({kind:"admission_test_dispatch_observation",stage:entry.metadata.stage,code:entry.metadata.code});
  }
  nativeConsoleError(...argumentsList);
};

/**
 * Exercises the real SDK without letting this native fixture reach the external provider.
 * @param input - Actual fetch input from Next or the pinned SDK.
 * @param init - Original request options and cancellation signal.
 * @returns Native framework traffic or an explicitly enabled synthetic read response.
 * @throws When provider endpoint/method/key is outside the owned fixture scope.
 */
globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(url.origin!==PROVIDER_ORIGIN){if(url.origin!==frameworkOrigin)throw new Error("NativeZavuProviderTransport failed: unregistered_external_origin");return nativeFetch(input,init);}
  request.signal.throwIfAborted();
  const resource=process.env.ADMISSION_TEST_ZAVU_RESOURCES==="1"&&Object.values(RESOURCE_PATH).includes(url.pathname)&&[...url.searchParams.keys()].every((key)=>key==="cursor"||key==="limit")&&url.searchParams.get("limit")==="50"&&(!url.searchParams.has("cursor")||url.searchParams.get("cursor")===RESOURCE_CURSOR);
  const senderDetail=process.env.ADMISSION_TEST_ZAVU_SENDER_ID!==undefined&&url.pathname===`${RESOURCE_PATH.senders}/${RESOURCE_ID.sender}`&&!url.search;
  const diagnosticSend=process.env.ADMISSION_TEST_ZAVU_RECIPIENT!==undefined&&url.pathname==="/v1/messages"&&request.method==="POST"&&!url.search;
  if(!(diagnosticSend||request.method==="GET"&&(url.pathname===CREDENTIAL_PATH&&!url.search||resource||senderDetail)))throw new Error("NativeZavuProviderTransport failed: unregistered_provider_request");
  if(request.headers.get("Authorization")!==`Bearer ${syntheticCredential}`)throw new Error("NativeZavuProviderTransport failed: crossed_credential");
  process.send?.(PROVIDER_REQUEST_NOTICE);
  const status=Number(process.env.ADMISSION_TEST_ZAVU_STATUS??"200");
  if(status!==200)return Response.json({message:"Synthetic private provider rejection"},{status});
  if(diagnosticSend){
    const body=await request.json(),code=typeof body.text==="string"?body.text.match(/\b\d{6}\b/u)?.[0]:undefined;
    if(body.to!==process.env.ADMISSION_TEST_ZAVU_RECIPIENT||body.channel!=="email"||body.fallbackEnabled!==false||request.headers.get("Zavu-Sender")!==RESOURCE_ID.sender||!code)throw new Error("NativeZavuProviderTransport failed: crossed_diagnostic_intent");
    // A private test-only IPC simulates receipt; code/headers/body are never printed or persisted.
    process.send?.({kind:"admission_test_diagnostic_code",code});
    return Response.json({message:{id:randomUUID(),direction:"outbound",channel:"email",status:"sent"}});
  }
  if(senderDetail)return Response.json({id:RESOURCE_ID.sender,name:"Remitente manual nativo",channels:["email","sms"],webhook:{secret:randomUUID()}});
  if(resource){
    if(!url.searchParams.has("cursor"))return Response.json({items:[],nextCursor:RESOURCE_CURSOR});
    const items=url.pathname===RESOURCE_PATH.senders?[{id:RESOURCE_ID.sender,name:"Remitente de prueba",channels:["email"],webhook:{secret:randomUUID()}}]:[{id:RESOURCE_ID.template,name:"Código de prueba",language:"es",category:"AUTHENTICATION",status:"approved",body:randomUUID()}];
    return Response.json({items,nextCursor:""});
  }
  return Response.json({isTestMode:process.env.ADMISSION_TEST_ZAVU_TEST_MODE!=="false",apiKey:{id:randomUUID()},project:{id:randomUUID()},team:{id:randomUUID()},ignoredProviderExtension:{arbitrary:true}});
};
