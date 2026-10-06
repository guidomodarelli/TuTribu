/** Models private durable operation identity independently of resource CAS and HTTP. */
export type AdmissionIntentValue = null | boolean | number | string | readonly AdmissionIntentValue[] | { readonly [key: string]: AdmissionIntentValue };
export type AdmissionOperationCommand = { actorUserId: string; tribeId: string; operationType: string; idempotencyKey: string; intent: AdmissionIntentValue };
export type AdmissionOperationResult<Result> = { state: "completed"; operationId: string; result: Result; replayed: boolean } | { state: "started"; operationId: string };
/** Requires a concrete owner to bind the business writer and public result contract. */
export interface AdmissionOperationRunner<Result> {
  resolve(command: AdmissionOperationCommand): Promise<AdmissionOperationResult<Result>>;
}
