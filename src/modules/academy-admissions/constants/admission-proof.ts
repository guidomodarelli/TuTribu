/** Defines local proof creation, attachment and their private audit/binding vocabulary. @module admission-proof-constants */
export const ADMISSION_PROOF_OPERATION = "attach_admission_proof";
export const ADMISSION_PROOF_AUDIT_EVENT = "proof_attached";
export const ADMISSION_PROOF_AUDIT_RULE = "local_verification";
/** Records newly issued local evidence independently of its later attachment or application. */
export const ADMISSION_PROOF_CREATION_AUDIT_EVENT = "proof_created";
/** Records actual withdrawal while retaining historical application references. */
export const ADMISSION_PROOF_INVALIDATION_AUDIT_EVENT = "proof_invalidated";
/** Serializes first contact claims independently of which proof/request supplied them. */
export const ADMISSION_CONTACT_BINDING_LOCK_DOMAIN = "admission_contact_binding";
export const ADMISSION_PROOF_APPLICATION_OUTCOME = { applied: "applied", denied: "denied" } as const;
