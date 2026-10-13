/** Exercises independent messaging versions, effective quota changes and private validation facts. @module admission-messaging-audit-event-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {createAdmissionConnectionAuditEvent,createAdmissionUsageAuditEvent} from "@/src/modules/academy-admissions/domain/entities/admission-messaging-audit-event";

/** @returns Original native actor/ledger and owner clock without a provider account. */
function scope(){return{tribeId:randomUUID(),actorUserId:randomUUID(),operationId:randomUUID(),createdAt:new Date("2026-10-13T19:00:00Z")};}

describe("messaging audit owner facts",()=>{
  it("should keep policy changes independent of consumption and detach the countries snapshot",()=>{
    const context=scope(),countries=["AR","UY"];
    const event=createAdmissionUsageAuditEvent({...context,eventType:"update_messaging_usage",version:2,previousVersion:1,allowedCountries:countries,verificationDailyLimit:0,notificationDailyLimit:30});
    countries.push("BR");
    expect(event).toMatchObject({resourceId:context.tribeId,resourceVersion:2,metadata:{previousVersion:1,allowedCountries:["AR","UY"],verificationDailyLimit:0,notificationDailyLimit:30}});
    expect(event.metadata).not.toHaveProperty("consumption");
  });
  it("should distinguish lifecycle CAS from immutable configuration version changes",()=>{
    const context=scope();
    const event=createAdmissionConnectionAuditEvent({...context,eventType:"configure_messaging_connection",connectionId:randomUUID(),version:5,state:"active",configurationVersion:3,previous:{state:"active",version:4,configurationVersion:2},channel:"sms",rule:null,cause:null});
    expect(event.metadata).toEqual({fromState:"active",toState:"active",previousVersion:4,configurationVersion:3,previousConfigurationVersion:2,channel:"sms"});
  });
  it("should retain the credential result and mode without storing provider resource or key identifiers",()=>{
    const context=scope();
    const event=createAdmissionConnectionAuditEvent({...context,eventType:"validate_messaging_connection",connectionId:randomUUID(),version:2,state:"draft",configurationVersion:1,previous:{state:"draft",version:1,configurationVersion:1},channel:null,rule:null,cause:null,previousCredentialState:"not_validated",credentialState:"valid",credentialMode:"production"});
    expect(event.metadata).toEqual({fromState:"draft",toState:"draft",previousVersion:1,configurationVersion:1,previousConfigurationVersion:1,channel:null,previousCredentialState:"not_validated",credentialState:"valid",credentialMode:"production"});
    expect(event.metadata).not.toHaveProperty("providerKeyRef");
  });
});
