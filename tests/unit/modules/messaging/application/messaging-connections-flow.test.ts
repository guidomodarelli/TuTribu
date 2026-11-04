/** Exercises the linear connection flow and the blocked reason of each step. @module messaging-connections-flow-tests */
import {describe,expect,it} from "vitest";
import {messagingConnectionsActionStepId,resolveMessagingConnectionsFlow} from "@/src/modules/messaging/application/commands/messaging-connections-flow";
import {resolveMessagingConnectionsNextAction} from "@/src/modules/messaging/application/commands/messaging-connections-next-action";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS} from "@/src/modules/messaging/constants/messaging-connection-lifecycle";

const observedAt="2026-10-20T15:00:00.000Z",now=Date.parse(observedAt),fresh=new Date(now-60_000).toISOString(),expired=new Date(now-MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS-60_000).toISOString();
const missingUsage={state:"not_configured" as const,policy:null};
const usage={state:"configured" as const,policy:{version:1,allowedCountries:["AR"],verificationDailyLimit:100,notificationDailyLimit:200,platformMaximums:{verificationDailyLimit:1000,notificationDailyLimit:5000},consumption:{verificationToday:0,notificationToday:0}}};
/** @param patch - Facts that differ from a valid production candidate with a tested email and an untested SMS. @returns Own projected metadata. */
function connection(patch:Partial<MessagingConfigurationConnection>={}):MessagingConfigurationConnection{
  return{id:"00000000-0000-4000-8000-000000000001",name:"Candidata",version:3,configurationVersion:2,state:"ready",credentialState:"valid",credentialMode:"production",maskedCredential:"••••••••",securityCurrent:true,capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:fresh},{channel:"sms",state:"unprepared",checkedAt:fresh,testedAt:null}],...patch};
}
/** @param candidate - Candidate under test. @returns Step ids with their blocked reasons. */
const flow=(candidate:MessagingConfigurationConnection|null,policy:typeof usage|typeof missingUsage=usage)=>resolveMessagingConnectionsFlow({candidate,usage:policy,observedAt}).map((step)=>[step.id,step.blockedReason]);

describe("messaging connections flow",()=>{
  it("should block every step after the key until a candidate is saved",()=>{
    expect(flow(null)).toEqual([["key","Guardá la clave de Zavu para seguir."],["credential","Guardá la clave de Zavu para seguir."],["channels","Guardá la clave de Zavu para seguir."],["activation",null]]);
  });
  it("should keep the credential and channels steps blocked until the credential is valid",()=>{
    expect(flow(connection({credentialState:"invalid",capabilities:[]}))).toEqual([["key",null],["credential","Comprobá la credencial para seguir."],["channels","Comprobá la credencial para seguir."],["activation",null]]);
  });
  it("should add one test step per usable channel and block each until its code is freshly confirmed",()=>{
    expect(flow(connection({capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:fresh},{channel:"sms",state:"unprepared",checkedAt:fresh,testedAt:null},{channel:"whatsapp",state:"unavailable",checkedAt:fresh,testedAt:null}]}))).toEqual([["key",null],["credential",null],["channels",null],["test:email",null],["test:sms","Confirmá el código de SMS para seguir."],["activation",null]]);
    expect(flow(connection({capabilities:[{channel:"email",state:"prepared",checkedAt:expired,testedAt:expired}]}))).toContainEqual(["test:email","Confirmá el código de Correo para seguir."]);
    expect(flow(connection({capabilities:[]}))).toContainEqual(["channels","Guardá al menos un canal para seguir."]);
  });
  it("should not block the unchanged active selection on tests older than 24 hours",()=>{
    const active=connection({state:"active",capabilities:[{channel:"email",state:"prepared",checkedAt:expired,testedAt:expired}]});
    expect(resolveMessagingConnectionsFlow({selected:active,candidate:active,usage,observedAt}).find((step)=>step.id==="test:email")?.blockedReason).toBeNull();
    expect(resolveMessagingConnectionsFlow({selected:null,candidate:active,usage,observedAt}).find((step)=>step.id==="test:email")?.blockedReason).toBe("Confirmá el código de Correo para seguir.");
  });
  it("should block a pending test until Países y cupos is saved, because the test consumes the daily code quota",()=>{
    expect(flow(connection(),missingUsage)).toEqual([["key",null],["credential",null],["channels",null],["test:email",null],["test:sms","Antes de probar un canal, guardá Países y cupos: la prueba usa el cupo diario de códigos."],["activation",null]]);
    expect(messagingConnectionsActionStepId(resolveMessagingConnectionsNextAction({selected:null,candidate:connection(),usage:missingUsage,observedAt}))).toBe("test:sms");
  });
  it("should resume at the step of the next action",()=>{
    const resume=(candidate:MessagingConfigurationConnection|null)=>messagingConnectionsActionStepId(resolveMessagingConnectionsNextAction({selected:null,candidate,usage,observedAt}));
    expect(resume(null)).toBe("key");expect(resume(connection({credentialState:"not_validated"}))).toBe("credential");expect(resume(connection({capabilities:[]}))).toBe("channels");expect(resume(connection())).toBe("test:sms");
    expect(resume(connection({capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:fresh}]}))).toBe("activation");expect(resume(connection({state:"suspended"}))).toBeNull();
  });
  it("should block the credential and later steps of a candidate sealed under a previous platform security",()=>{
    const blocked="Guardá la clave de Zavu otra vez para seguir: esta se guardó con una seguridad anterior de la plataforma.";
    expect(flow(connection({securityCurrent:false}))).toEqual(expect.arrayContaining([["credential",blocked],["channels",blocked]]));
  });
});
