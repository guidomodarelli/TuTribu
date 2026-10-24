/** Exercises capability-specific field contracts without provider, UI or source-text mocks. @module messaging-channel-draft-tests */
import {describe,expect,it} from "vitest";
import {validateMessagingChannelDraft} from "@/src/modules/messaging/application/commands/messaging-channel-draft";

describe("messaging channel draft",()=>{
  it("should require sender, template and exact language for WhatsApp while rejecting whitespace-only input",()=>{
    expect(validateMessagingChannelDraft({channel:"whatsapp",senderId:" ",templateId:"",templateLanguage:" "})).toMatchObject({valid:false,fieldErrors:{senderId:expect.any(String),templateId:expect.any(String),templateLanguage:expect.any(String)}});
    expect(validateMessagingChannelDraft({channel:"whatsapp",senderId:" sender-1 ",templateId:" template-1 ",templateLanguage:" es "})).toEqual({valid:true,fieldErrors:{},references:{channel:"whatsapp",senderId:"sender-1",templateId:"template-1",templateLanguage:"es"}});
  });
  it.each(["email","sms"] as const)("should retain only %s fields without leaking a previous WhatsApp draft into configuration",(channel)=>{
    expect(validateMessagingChannelDraft({channel,senderId:" sender-1 ",templateId:"template-from-whatsapp",templateLanguage:"es"})).toEqual({valid:true,fieldErrors:{},references:{channel,senderId:"sender-1"}});
  });
});
