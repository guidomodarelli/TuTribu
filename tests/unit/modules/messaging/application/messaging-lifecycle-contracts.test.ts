/** Exercises the actual own input/public result validators, never provider responses or source text. @module messaging-lifecycle-contracts-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { messagingConnectionSuspendSchema, messagingConnectionDisconnectSchema } from "@/src/modules/messaging/infrastructure/api/messaging-request-schemas";
import { messagingConnectionLifecycleResultSchema } from "@/src/modules/messaging/application/results/messaging-connection-lifecycle-result";

describe("local lifecycle public contracts",()=>{
  it("should accept only explicit safety causes and a positive observed version without duplicate compromise flags or private authority",()=>{
    const input={operationId:randomUUID(),confirmed:true,expectedVersion:3,reason:"security_stop"};expect(messagingConnectionSuspendSchema.parse(input)).toEqual(input);
    expect(messagingConnectionSuspendSchema.safeParse({...input,reason:"suspected_compromise"}).success).toBe(true);
    for(const invalid of[{...input,reason:"provider secret detail"},{...input,suspectedCompromise:true},{...input,actorUserId:randomUUID()},{...input,expectedVersion:0},{...input,confirmed:false}])expect(messagingConnectionSuspendSchema.safeParse(invalid).success).toBe(false);
  });
  it("should require only explicit disconnection/CAS while deriving dependencies and cause from current owners",()=>{
    const input={operationId:randomUUID(),confirmed:true,expectedVersion:3};expect(messagingConnectionDisconnectSchema.parse(input)).toEqual(input);
    for(const invalid of[{...input,reason:"silent override"},{...input,dependenciesResolved:true},{...input,secretRef:randomUUID()},{...input,expectedVersion:0}])expect(messagingConnectionDisconnectSchema.safeParse(invalid).success).toBe(false);
  });
  it("should project only local lifecycle facts and reject provider/credential information in the owned DTO",()=>{
    const result={id:randomUUID(),version:4,state:"suspended",reason:"security_stop",changed:true};expect(messagingConnectionLifecycleResultSchema.parse(result)).toEqual(result);
    expect(messagingConnectionLifecycleResultSchema.safeParse({...result,state:"disconnected",reason:null}).success).toBe(true);
    for(const invalid of[{...result,apiKey:randomUUID()},{...result,providerMessageId:randomUUID()},{...result,version:0},{...result,state:"active"}])expect(messagingConnectionLifecycleResultSchema.safeParse(invalid).success).toBe(false);
  });
});
