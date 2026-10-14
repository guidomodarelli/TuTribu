/** Exercises the complete private audit vocabulary and its deliberate metadata projection. @module admission-resource-audit-event-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {createAdmissionResourceAuditEvent} from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import type {AdmissionResourceAuditInput} from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import {createPersonalInvitationAuditEvent} from "@/src/modules/academy-admissions/domain/entities/personal-invitation-audit-event";
import {createPersonalInvitation,redeemPersonalInvitation,revokePersonalInvitation} from "@/src/modules/academy-admissions/domain/entities/personal-invitation";
import {ADMISSION_POLICY_AUDIT} from "@/src/modules/academy-admissions/constants/admission-policy";
import {VERIFICATION_RESEND_REASON} from "@/src/modules/academy-admissions/constants/verification-issuance";

/** @returns A native owner scope with fixed provenance and a mutable clock for snapshot checks. */
function ownerScope(){return{tribeId:randomUUID(),actorUserId:randomUUID(),operationId:randomUUID(),resourceId:randomUUID(),resourceVersion:2,rule:"effective_owner_rule",cause:null,createdAt:new Date("2026-10-13T17:00:00Z")};}

describe("complete private resource audit facts",()=>{
  it.each(["notification_obligation_created","notification_materialized"] as const)("should select only the original lineage and extent for %s without recipient or content",(eventType)=>{
    const scope=ownerScope(),obligationId=randomUUID(),requestId=randomUUID();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"admission_notification",resourceVersion:null,eventType,metadata:{obligationId,requestId,requestVersion:2,sourceEvent:"pending_created",audience:eventType==="notification_materialized"?"reviewer":null,durationMs:eventType==="notification_materialized"?7:null,recipientUserId:randomUUID(),title:"Synthetic private title",payload:{contact:"synthetic-private@example.test"},token:randomUUID()}});
    expect(event).toEqual({...scope,resourceType:"admission_notification",resourceVersion:null,eventType,metadata:{obligationId,requestId,requestVersion:2,sourceEvent:"pending_created",audience:eventType==="notification_materialized"?"reviewer":null,durationMs:eventType==="notification_materialized"?7:null}});
  });
  it.each(["quota_exceeded","worker_lease_expired","candidate_expired"] as const)("should retain the owned delivery cause %s without copying private transport fields",(cause)=>{
    const scope=ownerScope(),connectionId=randomUUID();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"message_delivery",eventType:cause==="quota_exceeded"?"delivery_deferred":cause==="candidate_expired"?"delivery_cancelled":"delivery_reconciled",cause,metadata:{fromState:"queued",toState:cause==="quota_exceeded"?"queued":cause==="candidate_expired"?"cancelled":"unknown",previousVersion:1,connectionId,connectionVersion:1,channel:"email",attemptId:null,authorizedUsagePolicyVersion:null,recipient:"private@example.test",providerMessageId:"synthetic-private-provider-id",leaseToken:"synthetic-private-lease"}});
    expect(event.cause).toBe(cause);
    expect(event.metadata).toEqual({fromState:"queued",toState:cause==="quota_exceeded"?"queued":cause==="candidate_expired"?"cancelled":"unknown",previousVersion:1,connectionId,connectionVersion:1,channel:"email",attemptId:null,authorizedUsagePolicyVersion:null});
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|synthetic-private-provider-id|synthetic-private-lease/);
  });
  it.each([ADMISSION_POLICY_AUDIT.invalidationRule,VERIFICATION_RESEND_REASON] as const)("should retain the owned proof invalidation cause %s and exclude private challenge material",(cause)=>{
    const scope=ownerScope(),challengeId=randomUUID();
    const input={...scope,resourceType:"admission_proof" as const,eventType:"proof_invalidated" as const,resourceVersion:null,rule:cause,cause,metadata:{fromState:"available" as const,toState:"invalid" as const,challengeId,requestId:null,verificationEpoch:1,channel:"email" as const,normalizedContact:"synthetic-private@example.test",leaseToken:randomUUID()}};
    const event=createAdmissionResourceAuditEvent(input);
    expect(event).toEqual({...scope,resourceType:"admission_proof",eventType:"proof_invalidated",resourceVersion:null,rule:cause,cause,metadata:{fromState:"available",toState:"invalid",challengeId,requestId:null,verificationEpoch:1,channel:"email"}});
  });
  it("should reconstruct the request transition and its proof without copying applicant content",()=>{
    // Arrange: the owner supplies references and effective statuses, never a raw command.
    const scope=ownerScope(),proofId=randomUUID(),decisionId=randomUUID();
    const input={...scope,resourceType:"admission_request" as const,eventType:"approved" as const,metadata:{fromStatus:"pending" as const,toStatus:"approved" as const,previousVersion:1,policyVersion:3,verificationEpoch:4,proofId,decisionId,invitationId:null,internalReason:"private-applicant-content",normalizedContact:"private@example.test",code:"synthetic-private-code",labels:{account:scope.actorUserId}}};
    // Act.
    const event=createAdmissionResourceAuditEvent(input);
    // Assert: retained fields establish exactly which scoped evidence supported the transition.
    expect(event).toEqual({...scope,resourceType:"admission_request",eventType:"approved",metadata:{fromStatus:"pending",toStatus:"approved",previousVersion:1,policyVersion:3,verificationEpoch:4,proofId,decisionId,invitationId:null}});
    expect(JSON.stringify(event)).not.toMatch(/private-applicant-content|private@example\.test|synthetic-private-code|labels/);
  });

  it("should keep a list entry status and import lineage without copying its contact or name",()=>{
    const scope=ownerScope(),importId=randomUUID();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"allowlist_entry",eventType:"confirm_allowlist_import",metadata:{fromStatus:null,toStatus:"enabled",previousVersion:null,importId,contactType:"email",normalizedContact:"private@example.test",internalName:"Private recipient"}});
    expect(event.metadata).toEqual({fromStatus:null,toStatus:"enabled",previousVersion:null,importId,contactType:"email"});
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|Private recipient/);
  });

  it("should preserve single-use invitation lineage without copying a token or recipient",()=>{
    const scope=ownerScope(),requestId=randomUUID();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"personal_invitation",eventType:"personal_invitation_redeemed",metadata:{fromStatus:"active",toStatus:"redeemed",previousVersion:1,requestId,fromAuthorizationRevoked:false,toAuthorizationRevoked:false,token:"synthetic-private-token",contact:"private@example.test"}});
    expect(event.metadata).toEqual({fromStatus:"active",toStatus:"redeemed",previousVersion:1,requestId,fromAuthorizationRevoked:false,toAuthorizationRevoked:false});
    expect(JSON.stringify(event)).not.toMatch(/synthetic-private-token|private@example\.test/);
  });

  it("should snapshot current quota and country changes independently of mutable usage counters",()=>{
    const scope=ownerScope(),countries=["AR","UY"];
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"messaging_usage_policy",eventType:"update_messaging_usage",metadata:{previousVersion:1,allowedCountries:countries,verificationDailyLimit:100,notificationDailyLimit:200,consumedToday:52,accountId:randomUUID()}});
    countries.push("BR");
    expect(event.metadata).toEqual({previousVersion:1,allowedCountries:["AR","UY"],verificationDailyLimit:100,notificationDailyLimit:200});
    expect(JSON.stringify(event)).not.toMatch(/consumedToday|accountId/);
  });

  it("should record connection and version changes without copying operational credential material",()=>{
    const scope=ownerScope();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"messaging_connection",eventType:"configure_messaging_connection",metadata:{fromState:"draft",toState:"ready",previousVersion:1,configurationVersion:2,previousConfigurationVersion:1,channel:"whatsapp",apiKey:"synthetic-private-key",ciphertext:"synthetic-private-envelope",providerPayload:{secret:true}}});
    expect(event.metadata).toEqual({fromState:"draft",toState:"ready",previousVersion:1,configurationVersion:2,previousConfigurationVersion:1,channel:"whatsapp"});
    expect(JSON.stringify(event)).not.toMatch(/synthetic-private-key|synthetic-private-envelope|providerPayload/);
  });

  it("should distinguish an authorized resource exposure from publishing resource or secret payloads",()=>{
    const scope=ownerScope();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"authorized_exposure",eventType:"authorized_resource_exposure",metadata:{surface:"connection_resources",itemCount:2,resourceKind:"senders",resources:[{phone:"private"}],credential:"synthetic-private-key"}});
    expect(event.metadata).toEqual({surface:"connection_resources",itemCount:2,resourceKind:"senders"});
    expect(JSON.stringify(event)).not.toMatch(/synthetic-private-key|phone/);
  });

  it("should preserve the worker delivery transition without copying a message or recipient",()=>{
    const scope={...ownerScope(),actorUserId:null,operationId:null};
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"message_delivery",eventType:"delivery_unknown",metadata:{fromState:"queued",toState:"unknown",previousVersion:1,connectionId:randomUUID(),connectionVersion:2,channel:"sms",attemptId:randomUUID(),authorizedUsagePolicyVersion:3,body:"synthetic-private-body",recipient:"private-phone"}});
    expect(event).toMatchObject({actorUserId:null,operationId:null,metadata:{fromState:"queued",toState:"unknown",channel:"sms",authorizedUsagePolicyVersion:3}});
    expect(JSON.stringify(event)).not.toMatch(/synthetic-private-body|private-phone/);
  });

  it("should retain protection rotation references without copying keys or ciphertext",()=>{
    const scope=ownerScope();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"messaging_protection",eventType:"protection_keys_rotated",metadata:{purpose:"contact_fingerprint",previousKeyId:randomUUID(),activeKeyId:randomUUID(),securityEpoch:randomUUID(),materialBase64:"synthetic-private-key",ciphertext:"synthetic-private-envelope"}});
    expect(event.metadata).not.toHaveProperty("materialBase64");
    expect(JSON.stringify(event)).not.toMatch(/synthetic-private-key|synthetic-private-envelope/);
  });

  it.each([{originalFromState:"suppressed",originalToState:"cancelled"},{originalFromState:"failed",originalToState:"failed"}] as const)("should retain both recovery lineages when the original moves from $originalFromState to $originalToState without copying frozen content",({originalFromState,originalToState})=>{
    const scope={...ownerScope(),resourceVersion:1},connectionId=randomUUID();
    const metadata={fromState:null,toState:"queued" as const,previousVersion:null,connectionId,connectionVersion:3,channel:"email" as const,attemptId:null,authorizedUsagePolicyVersion:null,originalDeliveryId:randomUUID(),targetConnectionId:connectionId,originalConnectionId:randomUUID(),originalConnectionVersion:2,originalFromState,originalToState,previousOriginalVersion:4,originalVersion:5,originalAttemptId:originalFromState==="failed"?randomUUID():null,originalAuthorizedUsagePolicyVersion:originalFromState==="failed"?2:null};
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"message_delivery",eventType:"notification_delivery_recovered",metadata:{...metadata,frozenIntent:{recipientRef:randomUUID()},recipient:randomUUID(),payloadMac:randomUUID()}});
    expect(event).toEqual({...scope,resourceType:"message_delivery",eventType:"notification_delivery_recovered",metadata});
    expect(event.metadata).not.toHaveProperty("frozenIntent");
    expect(event.metadata).not.toHaveProperty("recipient");
    expect(event.metadata).not.toHaveProperty("payloadMac");
  });

  it("should detach the authoritative audit timestamp from later caller clock changes",()=>{
    const scope=ownerScope();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"personal_invitation",eventType:"expired",metadata:{fromStatus:"active",toStatus:"expired",previousVersion:1,requestId:null,fromAuthorizationRevoked:false,toAuthorizationRevoked:false}});
    scope.createdAt.setUTCDate(14);
    expect(event.createdAt.toISOString()).toBe("2026-10-13T17:00:00.000Z");
  });

  it("should retain the exact local proof references without treating an external receipt as verification",()=>{
    const scope=ownerScope(),challengeId=randomUUID(),requestId=randomUUID();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"admission_proof",eventType:"proof_applied",metadata:{fromState:"available",toState:"applied",challengeId,requestId,verificationEpoch:3,channel:"email",codeMac:"private-verifier",codeEnvelope:"private-envelope"}});
    expect(event.metadata).toEqual({fromState:"available",toState:"applied",challengeId,requestId,verificationEpoch:3,channel:"email"});
    expect(JSON.stringify(event)).not.toMatch(/private-verifier|private-envelope/);
  });

  it("should preserve role and membership instance changes without copying global account or payment data",()=>{
    const scope=ownerScope(),membershipInstanceId=randomUUID(),requestId=randomUUID(),decisionId=randomUUID();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"membership",eventType:"membership_admitted",metadata:{membershipInstanceId,fromRole:null,toRole:"tribemate",fromStatus:null,toStatus:"active",requestId,decisionId,globalEmailVerified:true,providerClaims:{private:true},paymentPayload:"private-payment"}});
    expect(event.metadata).toEqual({membershipInstanceId,fromRole:null,toRole:"tribemate",fromStatus:null,toStatus:"active",requestId,decisionId});
    expect(JSON.stringify(event)).not.toMatch(/globalEmailVerified|providerClaims|private-payment/);
  });

  it("should record only the bounded maintenance result without retaining deleted resources",()=>{
    const scope={...ownerScope(),actorUserId:null,operationId:null,resourceVersion:null};
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"retention_run",eventType:"retention_completed",metadata:{owner:"admission_requests",processed:50,remaining:true,cutoff:"2026-04-16T00:00:00.000Z",deletedRows:[{contact:"private@example.test"}],snapshot:"private-snapshot"}});
    expect(event.metadata).toEqual({owner:"admission_requests",processed:50,remaining:true,cutoff:"2026-04-16T00:00:00.000Z"});
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|private-snapshot/);
  });

  it("should close an unusable internal resource kind without reflecting its private content",()=>{
    const input={...ownerScope(),resourceType:"synthetic-private-kind",eventType:"private-label",metadata:{apiKey:"synthetic-private-key"}} as unknown as AdmissionResourceAuditInput;
    expect(()=>createAdmissionResourceAuditEvent(input)).toThrow(expect.objectContaining({code:"invalid_input"}));
  });

  it("should distinguish withdrawn redeemed authorization while preserving its consumed status and request",()=>{
    const scope=ownerScope(),requestId=randomUUID();
    const event=createAdmissionResourceAuditEvent({...scope,resourceType:"personal_invitation",eventType:"revoke_personal_invitation",metadata:{fromStatus:"redeemed",toStatus:"redeemed",previousVersion:2,requestId,fromAuthorizationRevoked:false,toAuthorizationRevoked:true,internalReason:"private-withdrawal-reason"}});
    expect(event.metadata).toEqual({fromStatus:"redeemed",toStatus:"redeemed",previousVersion:2,requestId,fromAuthorizationRevoked:false,toAuthorizationRevoked:true});
    expect(JSON.stringify(event)).not.toContain("private-withdrawal-reason");
  });

  it("should derive creation provenance from the effective invitation without copying its private recipient",()=>{
    const scope=ownerScope();
    const invitation=createPersonalInvitation({id:scope.resourceId,tribeId:scope.tribeId,actorUserId:scope.actorUserId,now:scope.createdAt,contact:{type:"email",value:"private@example.test"},internalName:"Private recipient name",requiresAllowlist:false,allowlistExemptionAcknowledged:true,policy:{contactType:"email",requiresAdditionalVerification:false}});
    const event=createPersonalInvitationAuditEvent({actorUserId:scope.actorUserId,operationId:scope.operationId,eventType:"create_personal_invitation",invitation,previous:null});
    expect(event).toMatchObject({tribeId:scope.tribeId,resourceId:invitation.id,resourceVersion:1,actorUserId:scope.actorUserId,operationId:scope.operationId,createdAt:scope.createdAt,metadata:{fromStatus:null,toStatus:"active",previousVersion:null,requestId:null,fromAuthorizationRevoked:null,toAuthorizationRevoked:false}});
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|Private recipient name/);
    invitation.updatedAt.setUTCDate(14);
    expect(event.createdAt.toISOString()).toBe("2026-10-13T17:00:00.000Z");
  });

  it("should reconstruct an effective redeemed withdrawal independently of terminal request or membership outcomes",()=>{
    const scope=ownerScope(),requestId=randomUUID();
    const invitation=createPersonalInvitation({id:scope.resourceId,tribeId:scope.tribeId,actorUserId:scope.actorUserId,now:scope.createdAt,contact:{type:"email",value:"private@example.test"},internalName:"Private recipient name",requiresAllowlist:false,allowlistExemptionAcknowledged:true,policy:{contactType:"email",requiresAdditionalVerification:false}});
    const redeemed=redeemPersonalInvitation({invitation,expectedVersion:1,userId:randomUUID(),requestId,now:new Date("2026-10-13T17:01:00Z")}).invitation;
    const withdrawn=revokePersonalInvitation({invitation:redeemed,expectedVersion:2,revokeRedeemedAuthorization:true,now:new Date("2026-10-13T17:02:00Z")}).invitation;
    const event=createPersonalInvitationAuditEvent({actorUserId:scope.actorUserId,operationId:scope.operationId,eventType:"revoke_personal_invitation",invitation:withdrawn,previous:redeemed});
    expect(event).toMatchObject({resourceVersion:3,createdAt:withdrawn.updatedAt,metadata:{fromStatus:"redeemed",toStatus:"redeemed",previousVersion:2,requestId,fromAuthorizationRevoked:false,toAuthorizationRevoked:true}});
    expect(JSON.stringify(event)).not.toMatch(/private@example\.test|Private recipient name/);
  });
});
