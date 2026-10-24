/** Names immutable platform-key attestations, independently from contact or operation fingerprints. @module messaging-key-material-continuity-constants */
export const MESSAGING_KEY_MATERIAL_CONTINUITY = {
  proofDomain: "tutribu.messaging.key-material.v1",
  proofBytes: 32,
  table: "messaging_key_material_proofs",
  primaryKey: "messaging_key_material_proofs_pkey",
  purposeCheck: "messaging_key_material_purpose_check",
  proofCheck: "messaging_key_material_proof_check",
} as const;
