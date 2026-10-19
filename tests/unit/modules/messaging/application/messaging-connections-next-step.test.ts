/** Exercises the advisory workspace step derived from own connection metadata. @module messaging-connections-next-step-tests */
import {describe,expect,it} from "vitest";
import {resolveMessagingConnectionsNextStep} from "@/src/modules/messaging/application/commands/messaging-connections-next-step";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";

const now=new Date().toISOString();
/** @param patch - Facts that differ from a valid production candidate with one prepared channel. @returns Own projected metadata, never a provider DTO. */
function connection(patch:Partial<MessagingConfigurationConnection>={}):MessagingConfigurationConnection{
  return{id:"00000000-0000-4000-8000-000000000001",name:"Candidata",version:3,configurationVersion:2,state:"ready",credentialState:"valid",credentialMode:"production",maskedCredential:"••••••••",capabilities:[{channel:"email",state:"prepared",checkedAt:now,testedAt:now}],...patch};
}

describe("messaging connections next step",()=>{
  it("should start with saving a candidate when none exists, even with an active selection",()=>{
    expect(resolveMessagingConnectionsNextStep({selected:connection({state:"active"}),candidate:null})).toBe("saveCandidate");
  });
  it("should ask for a credential check before any channel work",()=>{
    expect(resolveMessagingConnectionsNextStep({selected:null,candidate:connection({credentialState:"not_validated",capabilities:[]})})).toBe("validateCredential");
    expect(resolveMessagingConnectionsNextStep({selected:null,candidate:connection({credentialState:"invalid"})})).toBe("validateCredential");
  });
  it("should send to Channels when no channel is usable",()=>{
    expect(resolveMessagingConnectionsNextStep({selected:null,candidate:connection({capabilities:[]})})).toBe("prepareChannel");
    expect(resolveMessagingConnectionsNextStep({selected:null,candidate:connection({capabilities:[{channel:"sms",state:"unavailable",checkedAt:now,testedAt:null}]})})).toBe("prepareChannel");
  });
  it("should send to Tests while a configured channel has no confirmed code",()=>{
    expect(resolveMessagingConnectionsNextStep({selected:null,candidate:connection({capabilities:[{channel:"email",state:"prepared",checkedAt:now,testedAt:now},{channel:"sms",state:"unprepared",checkedAt:now,testedAt:null}]})})).toBe("testChannel");
  });
  it("should not hold usable channels back because another channel became unavailable",()=>{
    expect(resolveMessagingConnectionsNextStep({selected:null,candidate:connection({capabilities:[{channel:"email",state:"unprepared",checkedAt:now,testedAt:null},{channel:"sms",state:"unavailable",checkedAt:now,testedAt:null}]})})).toBe("testChannel");
    expect(resolveMessagingConnectionsNextStep({selected:null,candidate:connection({capabilities:[{channel:"email",state:"prepared",checkedAt:now,testedAt:now},{channel:"sms",state:"unavailable",checkedAt:now,testedAt:null}]})})).toBe("activate");
  });
  it("should propose activation only for a tested candidate that is not already the exact selection",()=>{
    const candidate=connection();
    expect(resolveMessagingConnectionsNextStep({selected:null,candidate})).toBe("activate");
    expect(resolveMessagingConnectionsNextStep({selected:{...candidate,configurationVersion:1},candidate})).toBe("activate");
    expect(resolveMessagingConnectionsNextStep({selected:candidate,candidate})).toBe("active");
  });
});
