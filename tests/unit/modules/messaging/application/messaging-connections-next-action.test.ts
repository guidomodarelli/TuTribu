/** Exercises the single advisory next action derived from own connection metadata. @module messaging-connections-next-action-tests */
import {describe,expect,it} from "vitest";
import {isMessagingDiagnosticSettled,resolveMessagingConnectionsNextAction} from "@/src/modules/messaging/application/commands/messaging-connections-next-action";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingUsagePolicyStateDto} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import {MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS} from "@/src/modules/messaging/constants/messaging-connection-lifecycle";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";

const observedAt="2026-10-20T15:00:00.000Z",now=Date.parse(observedAt),fresh=new Date(now-60_000).toISOString(),expired=new Date(now-MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS-60_000).toISOString();
const usage={state:"configured" as const,policy:{version:1,allowedCountries:["AR"],verificationDailyLimit:100,notificationDailyLimit:200,platformMaximums:{verificationDailyLimit:1000,notificationDailyLimit:5000},consumption:{verificationToday:0,notificationToday:0}}};
/** @param patch - Facts that differ from a valid production candidate with one tested email channel. @returns Own projected metadata, never a provider DTO. */
function connection(patch:Partial<MessagingConfigurationConnection>={}):MessagingConfigurationConnection{
  return{id:"00000000-0000-4000-8000-000000000001",name:"Candidata",version:3,configurationVersion:2,state:"ready",credentialState:"valid",credentialMode:"production",maskedCredential:"••••••••",capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:fresh}],...patch};
}
/** @param candidate - Candidate under test. @param selected - Current selection. @param policy - Saved usage. @returns The resolved action at the fixed observation time. */
const resolve=(candidate:MessagingConfigurationConnection|null,selected:MessagingConfigurationConnection|null=null,policy:MessagingUsagePolicyStateDto=usage)=>resolveMessagingConnectionsNextAction({selected,candidate,usage:policy,observedAt});

describe("messaging connections next action",()=>{
  it("should start with saving a candidate when there is neither a candidate nor an active selection",()=>{
    expect(resolve(null)).toMatchObject({step:"saveCandidate",title:"Guardá la clave de Zavu",target:{kind:"step",step:"key"}});
    expect(resolve(null,connection({state:"suspended"}))).toMatchObject({step:"saveCandidate",target:{kind:"step",step:"key"}});
  });
  it("should report an active selection without a new candidate as finished instead of asking for the key again",()=>{
    expect(resolve(null,connection({state:"active"}))).toEqual({step:"active",title:"Conexión activa",reason:"La conexión seleccionada ya está activa para la academia. Para reemplazarla, guardá otra clave de Zavu en Clave.",action:null,target:null,channel:null});
  });
  it("should explain each credential state before any channel work",()=>{
    expect(resolve(connection({credentialState:"not_validated",capabilities:[]}))).toMatchObject({step:"validateCredential",title:"Comprobá la credencial"});
    expect(resolve(connection({credentialState:"invalid"}))).toMatchObject({step:"validateCredential",title:"Revisá la clave de Zavu"});
    expect(resolve(connection({credentialState:"unavailable"}))).toMatchObject({step:"validateCredential",title:"Volvé a comprobar la credencial"});
  });
  it("should send a suspended candidate to Security instead of activation",()=>{
    expect(resolve(connection({state:"suspended"}))).toMatchObject({title:"La candidata está suspendida",target:{kind:"security"}});
  });
  it("should send to Channels when no channel is usable, naming the unavailable ones",()=>{
    expect(resolve(connection({capabilities:[]}))).toMatchObject({step:"prepareChannel",title:"Prepará un canal"});
    expect(resolve(connection({capabilities:[{channel:"sms",state:"unavailable",checkedAt:fresh,testedAt:null}]}))).toMatchObject({step:"prepareChannel",title:"Revisá SMS en Canales"});
  });
  it("should ask to test the only pending channel with it preselected and say which channels are already verified",()=>{
    const action=resolve(connection({capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:fresh},{channel:"sms",state:"unprepared",checkedAt:fresh,testedAt:null}]}));
    expect(action).toEqual({step:"testChannel",title:"Falta probar SMS",reason:"Correo ya está comprobado. Falta SMS: todavía no se confirmó un código de prueba.",action:"Probá SMS",target:{kind:"step",step:"test"},channel:"sms"});
  });
  it("should treat a test older than 24 hours as pending again and explain why",()=>{
    const action=resolve(connection({capabilities:[{channel:"email",state:"prepared",checkedAt:expired,testedAt:expired}]}));
    expect(action).toMatchObject({step:"testChannel",channel:"email",action:"Probá Correo"});expect(action.reason).toBe("Correo necesita una prueba nueva: la anterior tiene más de 24 horas.");
  });
  it("should list every pending channel and preselect the first",()=>{
    const action=resolve(connection({capabilities:[{channel:"email",state:"unprepared",checkedAt:fresh,testedAt:null},{channel:"sms",state:"unprepared",checkedAt:fresh,testedAt:null},{channel:"whatsapp",state:"prepared",checkedAt:fresh,testedAt:fresh}]}));
    expect(action).toMatchObject({title:"Falta probar Correo y SMS",channel:"email"});expect(action.reason).toBe("WhatsApp ya está comprobado. Falta Correo y SMS: todavía no se confirmó un código de prueba.");
  });
  it("should send a pending test to Países y cupos first while the academy has no saved usage, keeping the channel to test",()=>{
    expect(resolve(connection({capabilities:[{channel:"email",state:"unprepared",checkedAt:fresh,testedAt:null}]}),null,{state:"not_configured",policy:null})).toEqual({step:"testChannel",title:"Guardá Países y cupos",reason:"La prueba de un canal consume el cupo diario de códigos, y la academia todavía no lo guardó.",action:"Ir a Países y cupos",target:{kind:"usage"},channel:"email"});
  });
  it("should block activation on an unavailable extra channel, a test account or missing countries",()=>{
    expect(resolve(connection({capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:fresh},{channel:"sms",state:"unavailable",checkedAt:fresh,testedAt:null}]}))).toMatchObject({step:"prepareChannel",title:"Revisá SMS en Canales"});
    expect(resolve(connection({credentialMode:"test"}))).toMatchObject({title:"Usá una cuenta de producción",target:{kind:"step",step:"credential"}});
    expect(resolve(connection({capabilities:[{channel:"sms",state:"prepared",checkedAt:fresh,testedAt:fresh}]}),null,{state:"not_configured",policy:null})).toMatchObject({title:"Guardá los países permitidos",target:{kind:"usage"}});
  });
  it("should offer activation for a fully tested candidate and stop once it is the exact selection",()=>{
    const candidate=connection({capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:fresh},{channel:"sms",state:"prepared",checkedAt:fresh,testedAt:fresh}]});
    expect(resolve(candidate)).toMatchObject({step:"activate",title:"Todo listo para activar",reason:"Correo y SMS están comprobados. Activá la conexión para usarla en la academia.",action:"Activar conexión",target:{kind:"step",step:"activation"}});
    expect(resolve(candidate,{...candidate,id:"00000000-0000-4000-8000-000000000009",name:"Anterior"}).reason).toMatch(/Reemplaza a Anterior\.$/);
    expect(resolve(candidate,{...candidate,configurationVersion:1}).step).toBe("activate");
    expect(resolve(candidate,candidate)).toMatchObject({step:"active",action:null,target:null});
  });
  it("should keep the unchanged active selection active when its tests are older than 24 hours",()=>{
    const active=connection({state:"active",capabilities:[{channel:"email",state:"prepared",checkedAt:expired,testedAt:expired}]});
    expect(resolve(active,active)).toMatchObject({step:"active",action:null});
    expect(resolve(active,{...active,configurationVersion:1})).toMatchObject({step:"testChannel",channel:"email"});
  });
});

describe("messaging diagnostic settlement",()=>{
  const issuedAt=now-120_000,diagnostic={outcome:"issued" as const,diagnosticId:"00000000-0000-4000-8000-000000000011",challengeId:"00000000-0000-4000-8000-000000000012",deliveryId:"00000000-0000-4000-8000-000000000013",connectionId:"00000000-0000-4000-8000-000000000001",connectionVersion:2,channel:"email" as const,maskedDestination:"d•••@example.test",expiresAt:new Date(issuedAt+600_000).toISOString(),resendAllowedAt:new Date(issuedAt+ADMISSION_LIMIT.verificationResendWaitMs).toISOString()};
  it("should settle a test once its channel was confirmed at or after it was issued",()=>{
    expect(isMessagingDiagnosticSettled(diagnostic,connection({capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:new Date(issuedAt+30_000).toISOString()}]}))).toBe(true);
  });
  it("should keep waiting for the code of a re-test issued after the previous confirmation",()=>{
    expect(isMessagingDiagnosticSettled(diagnostic,connection({capabilities:[{channel:"email",state:"prepared",checkedAt:fresh,testedAt:new Date(issuedAt-30_000).toISOString()}]}))).toBe(false);
  });
  it("should not settle an unconfirmed channel, another channel or another configuration",()=>{
    expect(isMessagingDiagnosticSettled(diagnostic,connection({capabilities:[{channel:"email",state:"unprepared",checkedAt:fresh,testedAt:null}]}))).toBe(false);
    expect(isMessagingDiagnosticSettled({...diagnostic,channel:"sms"},connection())).toBe(false);
    expect(isMessagingDiagnosticSettled(diagnostic,connection({configurationVersion:3}))).toBe(false);
    expect(isMessagingDiagnosticSettled(diagnostic,null)).toBe(false);
  });
});
