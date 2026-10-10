/** Models private durable operation identity independently of resource CAS and HTTP. */
export type AdmissionIntentValue = null | boolean | number | string | readonly AdmissionIntentValue[] | { readonly [key: string]: AdmissionIntentValue };
export type AdmissionOperationCommand = { actorUserId: string; tribeId: string; operationType: string; idempotencyKey: string; intent: AdmissionIntentValue };
export type AdmissionOperationResult<Result> = { state: "completed"; operationId: string; result: Result; replayed: boolean } | { state: "started"; operationId: string };
/** Keeps every explicit resource version and owner-normalized row intent in a batch fingerprint. */
export type AdmissionBatchItem = {resourceId:string;expectedVersion:number;intent:AdmissionIntentValue};
/** Batches retain the same actor/tenant/type/client identity and include all contextual intent. */
export type AdmissionBatchOperationCommand = Omit<AdmissionOperationCommand,"intent"> & {intent:{context:AdmissionIntentValue;items:readonly AdmissionBatchItem[]}};
/** Requires a concrete owner to bind the business writer and public result contract. */
export interface AdmissionOperationRunner<Result> {
  resolve(command: AdmissionOperationCommand): Promise<AdmissionOperationResult<Result>>;
}
