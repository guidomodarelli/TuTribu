/** Exercises own visible activation prerequisites without replacing current server authorization. @module messaging-activation-requirements-tests */
import {describe,expect,it} from "vitest";
import {assessMessagingActivationRequirements,nextMessagingActivationFreshnessChange} from "@/src/modules/messaging/application/commands/messaging-activation-requirements";
import {MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS} from "@/src/modules/messaging/constants/messaging-connection-lifecycle";

/** @returns Own projected candidate and usage metadata at a supplied deterministic render time. */
function requirementsFixture(){const now="2026-10-08T04:00:00.000Z",candidate={id:"00000000-0000-4000-8000-000000000001",name:"Candidata",version:4,configurationVersion:2,state:"draft" as const,credentialState:"valid" as const,credentialMode:"production" as const,maskedCredential:"••••••••" as const,securityCurrent:true,capabilities:[{channel:"email" as const,state:"prepared" as const,checkedAt:now,testedAt:now}]},usage={state:"configured" as const,policy:{version:1,allowedCountries:[],verificationDailyLimit:100,notificationDailyLimit:200,platformMaximums:{verificationDailyLimit:1000,notificationDailyLimit:5000},consumption:{verificationToday:1,notificationToday:0}}};return{now,candidate,usage};}

describe("visible activation prerequisites",()=>{
  it("should permit an explicit proposal for a production candidate with a recent email test independently of countries",()=>{const fixture=requirementsFixture();expect(assessMessagingActivationRequirements(fixture.candidate,fixture.usage,fixture.now)).toEqual({eligible:true,messages:[]});});
  it("should explain test mode or unchecked credential instead of presenting the candidate as production-ready",()=>{const fixture=requirementsFixture();expect(assessMessagingActivationRequirements({...fixture.candidate,credentialMode:"test"},fixture.usage,fixture.now)).toMatchObject({eligible:false,messages:[expect.stringMatching(/producción/i)]});expect(assessMessagingActivationRequirements({...fixture.candidate,credentialState:"not_validated"},fixture.usage,fixture.now)).toMatchObject({eligible:false,messages:[expect.stringMatching(/credencial/i)]});});
  it("should require configured channels with recent local tests, including the exact inclusive day boundary",()=>{const fixture=requirementsFixture();expect(assessMessagingActivationRequirements({...fixture.candidate,capabilities:[]},fixture.usage,fixture.now)).toMatchObject({eligible:false,messages:[expect.stringMatching(/canal/i)]});expect(assessMessagingActivationRequirements({...fixture.candidate,capabilities:[{...fixture.candidate.capabilities[0],testedAt:"2026-10-07T04:00:00.000Z"}]},fixture.usage,fixture.now).eligible).toBe(true);expect(assessMessagingActivationRequirements({...fixture.candidate,capabilities:[{...fixture.candidate.capabilities[0],testedAt:"2026-10-07T03:59:59.999Z"}]},fixture.usage,fixture.now)).toMatchObject({eligible:false,messages:[expect.stringMatching(/probar/i)]});});
  it("should require saved countries for a phone capability and close a suspended candidate",()=>{const fixture=requirementsFixture(),candidate={...fixture.candidate,capabilities:[{...fixture.candidate.capabilities[0],channel:"sms" as const}]};expect(assessMessagingActivationRequirements(candidate,fixture.usage,fixture.now)).toMatchObject({eligible:false,messages:[expect.stringMatching(/países/i)]});expect(assessMessagingActivationRequirements(candidate,{...fixture.usage,policy:{...fixture.usage.policy,allowedCountries:["AR"]}},fixture.now).eligible).toBe(true);expect(assessMessagingActivationRequirements({...fixture.candidate,state:"suspended"},fixture.usage,fixture.now)).toMatchObject({eligible:false,messages:[expect.stringMatching(/suspendida/i)]});});

  it("should name the next moment a channel test changes freshness, and nothing to wait for when none can",()=>{
    const fixture=requirementsFixture(),capability=fixture.candidate.capabilities[0],testedMs=Date.parse(capability.testedAt);
    // A recent test becomes stale just after its window closes; eligibility can change exactly then.
    expect(nextMessagingActivationFreshnessChange(fixture.candidate,fixture.now)).toBe(testedMs+MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS+1);
    // A test stamped ahead of this clock becomes usable when the clock reaches it.
    const ahead=new Date(Date.parse(fixture.now)+60_000).toISOString();
    expect(nextMessagingActivationFreshnessChange({...fixture.candidate,capabilities:[{...capability,testedAt:ahead}]},fixture.now)).toBe(Date.parse(ahead));
    // A stale or untested channel, or no candidate, never changes with time.
    expect(nextMessagingActivationFreshnessChange(fixture.candidate,new Date(testedMs+MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS+1).toISOString())).toBeNull();
    expect(nextMessagingActivationFreshnessChange({...fixture.candidate,capabilities:[{...capability,testedAt:null}]},fixture.now)).toBeNull();
    expect(nextMessagingActivationFreshnessChange(null,fixture.now)).toBeNull();
  });
  it("should not let a candidate sealed under a previous platform security be activated",()=>{const fixture=requirementsFixture();expect(assessMessagingActivationRequirements({...fixture.candidate,securityCurrent:false},fixture.usage,fixture.now)).toEqual({eligible:false,messages:["La candidata se guardó con una seguridad anterior de la plataforma; guardá la clave de Zavu otra vez antes de activar."]});});
});
