/** Runs actual activation owners with closed HTTP, without Vitest, migrations or CLI dependencies. */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import type { MessagingRestoreSql } from "./messaging-restore-composition";
import type {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {PostgresMessagingConnectionActivation} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-activation";
import {readAdmissionEmailLifecycleDependency} from "@/src/modules/notifications/infrastructure/repositories/admission-email-lifecycle-reader";
import {PostgresMessagingSelectionDependencies} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-selection-dependencies";
import {ZavuCredentialInspectorFactory} from "@/src/modules/messaging/infrastructure/zavu/zavu-credential-inspector-factory";
import {ZavuMessageDeliverySender} from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import {ScopedConnectionDiagnosticDispatcher} from "@/src/modules/messaging/infrastructure/composition/connection-diagnostic-dispatcher";
import {buildMessagingModule,buildMessagingWorkModule} from "@/src/modules/messaging/setup";
import {VERIFICATION_MESSAGE_COPY} from "@/src/modules/messaging/constants/zavu-delivery";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

import { MESSAGING_NATIVE_ACTIVATION as SETUP } from "./constants/messaging-activation-native";

/** Requires only current creation owners and metadata, without a bearer session token. */
export type MessagingActivationCreation = Pick<Awaited<ReturnType<typeof prepareMessagingConnectionCreation>>, "fixture" | "context" | "repository" | "execute">;

/** @param database - Exact owned SQL capability. @param original - Actual native account, tribe and creation owner. @param options - Preparation facts; schema work stays outside this runtime. @returns Actual SDK checks, diagnostic verification and activation authority with no external messages. */
export async function prepareMessagingActivationFromCreation<Creation extends MessagingActivationCreation>(database: MessagingRestoreSql, original: Creation, options: { diagnosticRecipient?: string; initializeUsagePolicy: boolean; readSecurityConfig?: () => Promise<MessagingSecurityConfig> }) {
  const fixture = original;
  const credential = randomUUID(), senderId = randomUUID();
  const readSecurityConfig = options.readSecurityConfig ?? (async () => fixture.fixture.config);
  const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Activación real",apiKey:credential});if(created.state!=="completed")throw new Error("Expected protected candidate");
  await database.withContext(fixture.fixture.own,async(transaction)=>{
    if(options.initializeUsagePolicy)await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${fixture.context.tribeId})`);
  });
  let code="",transactions=0;
  const execute=async<Result>(_context:{actorUserId:string},run:(database:RequestDatabase)=>Promise<Result>)=>{transactions+=1;try{return await database.withContext(fixture.fixture.own,run);}finally{transactions-=1;}};
  const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>execute(fixture.context,run));
  const request=buildMessagingModule({accounts,clock:()=>new Date(),execute:(_account,run)=>execute(fixture.context,run)}).createRequestModule({selection:"management",readSecurityConfig});
  const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:`/v1/senders/${senderId}`,method:"GET",respond:()=>Response.json({id:senderId,name:"Remitente",channels:["email"]})},{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:()=>Response.json({isTestMode:false,apiKey:{id:randomUUID()},project:{id:randomUUID()},team:{id:randomUUID()}})},{origin:"https://api.zavu.dev",pathname:"/v1/messages",method:"POST",respond:async(incoming)=>{if (transactions !== 0) throw new Error("MessagingNativeActivation.dispatch failed: SQL_transaction_still_open");const body=await incoming.json() as{text:string};code=body.text.slice(VERIFICATION_MESSAGE_COPY.prefix.length,-VERIFICATION_MESSAGE_COPY.suffix.length);return Response.json({message:{id:randomUUID(),direction:"outbound",channel:"email",status:"sent"}});}}]);
  const inspectors=new ZavuCredentialInspectorFactory(transport.fetch),base={tribeId:fixture.context.tribeId,connectionId:created.result.id,requestId:randomUUID()};
  const configuration = await request.createConnectionConfiguration(inspectors).execute({...base,operationId:randomUUID(),confirmed:true,expectedVersion:1,channel:"email",senderId},new AbortController().signal);
  if (!configuration.ok || configuration.value.state !== "completed" || configuration.value.result.version !== SETUP.configuredVersion || configuration.value.result.configurationVersion !== SETUP.configuredVersion) throw new Error("MessagingNativeActivation.configure failed: configuration_unconfirmed");
  const validation = await request.createCredentialValidation(inspectors).execute({...base,operationId:randomUUID(),confirmed:true,expectedVersion:2},new AbortController().signal);
  if (!validation.ok || validation.value.state !== "completed" || validation.value.result.version !== SETUP.validatedVersion || validation.value.result.credentialMode !== SETUP.credentialMode) throw new Error("MessagingNativeActivation.validate failed: production_credential_unconfirmed");
  const deferred: Promise<void>[] = [];
  const dispatcher = new ScopedConnectionDiagnosticDispatcher({
    readSecurityFacts: async () => { const current = await readSecurityConfig(); return { environment: current.environment, securityEpoch: current.securityEpoch, recoveryLocked: current.recoveryLocked }; },
    createDispatcher: (diagnosticScope, authorize) => buildMessagingWorkModule({ diagnosticScope, authorize, execute: (_actor, run) => execute(fixture.context, run), readSecurityConfig, createSender: (preparation) => new ZavuMessageDeliverySender(preparation, transport.fetch), runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: () => { throw new Error("MessagingNativeActivation.dispatch failed: diagnostic_runtime_failure"); } } }).useCases.dispatch,
  });
  const issued=await request.createDiagnosticIssuance(dispatcher).execute({...base,operationId:randomUUID(),confirmed:true,expectedVersion:3,channel:"email",recipient:options.diagnosticRecipient??fixture.fixture.own.email});/** @returns The closed public reason that the diagnostic issuance did not complete as issued. */const describeIssuance=()=>{if(!issued.ok)return issued.failure.code;if(issued.value.state!=="completed")return issued.value.state;return issued.value.result.outcome==="denied"?issued.value.result.code:issued.value.result.outcome;};if(!issued.ok||issued.value.state!=="completed"||issued.value.result.outcome!=="issued")throw new Error(`Expected real diagnostic issuance: ${describeIssuance()}`);await Promise.all(deferred);
  const verificationInput={...base,diagnosticId:issued.value.result.diagnosticId,operationId:randomUUID(),code};
  const verified = await request.useCases.verifyDiagnostic.execute(verificationInput);
  if (!verified.ok || verified.value.state !== "completed" || verified.value.result.outcome !== "verified") throw new Error("MessagingNativeActivation.verify failed: diagnostic_unconfirmed");
  const resolved=await request.useCases.resolveContext.execute({...base,operation:"activate_messaging_connection"});if(!resolved.allowed)throw new Error("Expected current activation authority");
  const owner=new PostgresMessagingConnectionActivation(execute,readSecurityConfig,(transaction)=>new PostgresMessagingSelectionDependencies(transaction,readAdmissionEmailLifecycleDependency));
  const lifecycleVersion=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute<{version:number}>(sql`select version from public.tenant_messaging_connections where id=${created.result.id}`)).rows[0].version);
  return{fixture,transport,owner,request,inspectors,execute,verificationInput,credential,senderId,context:resolved.context,input:{operationId:randomUUID(),expectedVersion:lifecycleVersion,confirmed:true as const},get transactions(){return transactions;}};
}

