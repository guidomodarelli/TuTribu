/** Exercises native identity binding and original progress through owned ports without platform mocks. @module transfer-tribe-leadership-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { TransferTribeLeadershipUseCase } from "@/src/modules/tribes/application/use-cases/transfer-tribe-leadership-use-case";
import { TribeLeadershipOperationError } from "@/src/modules/tribes/domain/errors/tribe-leadership-operation-error";
import type { TribeLeadershipWriter } from "@/src/modules/tribes/domain/repositories/tribe-leadership-repository";
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";

/** @returns Private native account facts and an original transfer, without permission flags or a new membership. */
function transferFixture(){
  const now=new Date("2026-10-08T12:00:00Z"),userId=randomUUID(),sessionId=randomUUID(),command={tribeId:randomUUID(),requestId:randomUUID(),operationId:randomUUID(),expectedLeaderUserId:userId,nextLeaderUserId:randomUUID(),formerLeaderRole:"guardian" as const,confirmed:true},account={userId,normalizedEmail:"native@example.test",session:{id:sessionId,expiresAt:new Date(now.getTime()+60_000)},googleAccount:null,identityEvidence:null,recentAuthentication:[]},accounts:AuthenticatedAccountProvider={getAuthenticatedAccount:vi.fn(async()=>account)},transfer=vi.fn<TribeLeadershipWriter["transfer"]>(async()=>({state:"completed",operationId:command.operationId,replayed:false,result:{previousLeaderUserId:userId,leaderUserId:command.nextLeaderUserId,formerLeaderRole:command.formerLeaderRole,suspendedConnectionIds:[]}})),writer:TribeLeadershipWriter={transfer};return{now,userId,sessionId,command,account,accounts,writer,transfer};
}

describe("explicit tribe leadership transfer",()=>{
  it("should bind the actual native account and session while forwarding only the confirmed original role change",async()=>{
    const fixture=transferFixture(),useCase=new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now);expect(await useCase.execute(fixture.command)).toMatchObject({state:"completed",operationId:fixture.command.operationId,result:{leaderUserId:fixture.command.nextLeaderUserId}});expect(fixture.transfer).toHaveBeenCalledWith({tribeId:fixture.command.tribeId,actorUserId:fixture.userId,sessionId:fixture.sessionId,requestId:fixture.command.requestId},{operationId:fixture.command.operationId,expectedLeaderUserId:fixture.userId,nextLeaderUserId:fixture.command.nextLeaderUserId,formerLeaderRole:"guardian",confirmed:true});expect(JSON.stringify(fixture.transfer.mock.calls)).not.toContain(fixture.account.normalizedEmail);
  });
  it("should require an actual current account before invoking any ownership writer",async()=>{
    const fixture=transferFixture();fixture.accounts.getAuthenticatedAccount=vi.fn(async()=>null);await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(fixture.command)).rejects.toMatchObject({code:"authentication_required"});expect(fixture.transfer).not.toHaveBeenCalled();
  });
  it("should omit caller-only permission and private fields from the owned transfer input",async()=>{
    const fixture=transferFixture();await new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute({...fixture.command,createdBy:fixture.userId,paid:true,apiKey:randomUUID()} as typeof fixture.command);expect(fixture.transfer.mock.calls[0][1]).toEqual({operationId:fixture.command.operationId,expectedLeaderUserId:fixture.userId,nextLeaderUserId:fixture.command.nextLeaderUserId,formerLeaderRole:"guardian",confirmed:true});
  });
  it("should sample session lifetime after the awaited native identity lookup",async()=>{
    const fixture=transferFixture();let now=fixture.now;fixture.accounts.getAuthenticatedAccount=vi.fn(async()=>{now=fixture.account.session.expiresAt;return fixture.account;});await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>now).execute(fixture.command)).rejects.toMatchObject({code:"authentication_required"});expect(fixture.transfer).not.toHaveBeenCalled();
  });
  it("should normalize an unexpected native lookup failure before invoking any writer",async()=>{
    const fixture=transferFixture(),cause=new Error("Synthetic native account lookup unavailable");fixture.accounts.getAuthenticatedAccount=vi.fn(async()=>{throw cause;});await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(fixture.command)).rejects.toMatchObject({code:"unexpected_failure",cause,operationId:undefined});expect(fixture.transfer).not.toHaveBeenCalled();
  });
  it.each(["unconfirmed","foreign_leader","self_target"] as const)("should reject %s without claiming that a caller flag grants leadership",async(condition)=>{
    const fixture=transferFixture(),command={...fixture.command,...(condition==="unconfirmed"?{confirmed:false}:condition==="foreign_leader"?{expectedLeaderUserId:randomUUID()}:{nextLeaderUserId:fixture.userId})};await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(command)).rejects.toMatchObject({code:condition==="foreign_leader"?"leadership_conflict":"invalid_input"});expect(fixture.transfer).not.toHaveBeenCalled();
  });
  it("should retain genuine unfinished progress for the original UUID without another write",async()=>{
    const fixture=transferFixture();fixture.transfer.mockResolvedValue({state:"started",operationId:fixture.command.operationId});expect(await new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(fixture.command)).toEqual({state:"started",operationId:fixture.command.operationId});expect(fixture.transfer).toHaveBeenCalledTimes(1);
  });
  it("should preserve the owner's current role denial and its private cause",async()=>{
    const fixture=transferFixture(),cause=new Error("Synthetic canonical leader changed"),denied=new TribeLeadershipOperationError("permission_denied",{cause});fixture.transfer.mockRejectedValue(denied);await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(fixture.command)).rejects.toBe(denied);
  });
  it("should expose unresolved progress only when the owner names this exact original operation",async()=>{
    const fixture=transferFixture();fixture.transfer.mockRejectedValue(new TribeLeadershipOperationError("operation_unresolved",{operationId:fixture.command.operationId}));await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(fixture.command)).rejects.toMatchObject({code:"operation_unresolved",operationId:fixture.command.operationId});fixture.transfer.mockRejectedValue(new TribeLeadershipOperationError("operation_unresolved",{operationId:randomUUID()}));await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(fixture.command)).rejects.toMatchObject({code:"unexpected_failure",operationId:undefined});
  });
  it("should reject a writer response for another UUID instead of declaring this transfer confirmed",async()=>{
    const fixture=transferFixture();fixture.transfer.mockResolvedValue({state:"started",operationId:randomUUID()});await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(fixture.command)).rejects.toMatchObject({code:"public_contract_unusable"});expect(fixture.transfer).toHaveBeenCalledTimes(1);
  });
  it("should reject completed metadata for another leader or former role even when the UUID matches",async()=>{
    const fixture=transferFixture();fixture.transfer.mockResolvedValue({state:"completed",operationId:fixture.command.operationId,replayed:true,result:{previousLeaderUserId:fixture.userId,leaderUserId:randomUUID(),formerLeaderRole:"tribemate",suspendedConnectionIds:[]}});await expect(new TransferTribeLeadershipUseCase(fixture.accounts,fixture.writer,()=>fixture.now).execute(fixture.command)).rejects.toMatchObject({code:"public_contract_unusable"});expect(fixture.transfer).toHaveBeenCalledTimes(1);
  });
});
