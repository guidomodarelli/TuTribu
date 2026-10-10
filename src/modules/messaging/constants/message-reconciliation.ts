/** Names fixed provider-read diagnostics, independently of send authorization and reconciliation writes. @module message-reconciliation-constants */
export const MESSAGE_STATUS_LOOKUP_OPERATION = "readMessageStatus";
/** Classifies this provider lookup as a read; it never implies an authorized external send. */
export const MESSAGE_STATUS_PROVIDER_OPERATION = "read";
