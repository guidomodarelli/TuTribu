/** Exercises basic membership eligibility independently of billing and transport. */
import {describe,expect,it} from "vitest";
import {evaluateAcademyMembershipEligibility,type AcademyMembershipFacts} from "@/src/modules/tribes/domain/value-objects/academy-membership-eligibility";

describe("academy membership eligibility",()=>{
  it("should propose a new basic tribemate without a paid grant",()=>{
    expect(evaluateAcademyMembershipEligibility(null)).toEqual({outcome:"create",role:"tribemate",status:"active"});
  });
  it.each(["leader","guardian","tribemate"] as const)("should preserve an existing %s with readable active or muted state",(role)=>{
    for(const status of ["active","muted"] as const){
      const existing:AcademyMembershipFacts={id:"member",role,status,statusReason:"none",commercialRecoveryStatus:null,createdAt:new Date("2026-01-01T00:00:00Z")};
      expect(evaluateAcademyMembershipEligibility(existing)).toEqual({outcome:"already_member",member:existing});
    }
  });
  it.each([
    {status:"blocked",statusReason:"payment_blocked"},
    {status:"removed",statusReason:"subscription_inactive"},
  ] as const)("should recover $status/$statusReason to the observed muted state",({status,statusReason})=>{
    const existing:AcademyMembershipFacts={id:"member",role:"tribemate",status,statusReason,commercialRecoveryStatus:"muted",createdAt:new Date("2026-01-01T00:00:00Z")};
    expect(evaluateAcademyMembershipEligibility(existing)).toEqual({outcome:"recover",member:existing,role:"tribemate",status:"muted"});
    expect(existing.status).toBe(status);
  });
  it.each([
    {role:"tribemate",status:"blocked",statusReason:"conduct_blocked",commercialRecoveryStatus:"active"},
    {role:"tribemate",status:"removed",statusReason:"none",commercialRecoveryStatus:"active"},
    {role:"guardian",status:"removed",statusReason:"subscription_inactive",commercialRecoveryStatus:"active"},
    {role:"leader",status:"blocked",statusReason:"payment_blocked",commercialRecoveryStatus:"muted"},
    {role:"tribemate",status:"blocked",statusReason:"payment_blocked",commercialRecoveryStatus:null},
  ] as const)("should deny recovery for $role/$status/$statusReason/$commercialRecoveryStatus",(row)=>{
    const existing:AcademyMembershipFacts={...row,id:"member",createdAt:new Date("2026-01-01T00:00:00Z")};
    expect(evaluateAcademyMembershipEligibility(existing)).toMatchObject({outcome:"blocked"});
  });
});
