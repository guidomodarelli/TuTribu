/** Exercises diagnostic pre-action contracts against real normalization without provider or UI mocks. @module messaging-diagnostic-draft-tests */
import {describe,expect,it} from "vitest";
import {validateMessagingDiagnosticDraft,validateMessagingDiagnosticCode} from "@/src/modules/messaging/application/commands/messaging-diagnostic-draft";

describe("diagnostic input preparation",()=>{
  it("should keep email independent from saved phone countries and normalize only the explicit destination",()=>{
    expect(validateMessagingDiagnosticDraft({channel:"email",recipient:" Diagnostic+tag@Example.test ",country:""},[])).toMatchObject({valid:true,destination:{channel:"email",recipient:"diagnostic+tag@example.test"}});
  });
  it("should reject a phone before country is saved or when the destination is inconsistent with the selected country",()=>{
    expect(validateMessagingDiagnosticDraft({channel:"sms",recipient:"+5491155551234",country:"AR"},[])).toMatchObject({valid:false,fieldErrors:{country:expect.any(String)}});
    expect(validateMessagingDiagnosticDraft({channel:"whatsapp",recipient:"+14155552671",country:"AR"},["AR"])).toMatchObject({valid:false,fieldErrors:{recipient:expect.any(String)}});
    expect(validateMessagingDiagnosticDraft({channel:"sms",recipient:"+5491155551234",country:"AR"},["AR"])).toMatchObject({valid:true,destination:{country:"AR",channel:"sms"}});
  });
  it("should require the real six-digit local code shape without accepting blank, partial or arbitrary text",()=>{
    expect(validateMessagingDiagnosticCode("123456")).toBeNull();for(const code of["","12345","1234567","abcdef"])expect(validateMessagingDiagnosticCode(code)).toEqual(expect.any(String));
  });
});
