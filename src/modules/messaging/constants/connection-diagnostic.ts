/** Names local diagnostic effects independently of provider delivery and admission evidence. @module connection-diagnostic-constants */
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
/** Aligns the exact ledger intent with the current sensitive authorization operation. */
export const CONNECTION_DIAGNOSTIC_VERIFY_OPERATION = REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic;
/** Records the local terminal result; provider acceptance cannot select these states. */
export const CONNECTION_DIAGNOSTIC_OUTCOME = { pending: "pending", verified: "verified", failed: "failed" } as const;
/** Distinguishes local confirmation from a safe expected denial. */
export const CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME = { denied: "denied", verified: "verified" } as const;
/** Server logs expose fixed owner vocabulary and safe metadata rather than provider or SQL causes. */
export const CONNECTION_DIAGNOSTIC_DISPATCH_LOG={feature:"messaging",message:"Connection diagnostic dispatch failed"} as const;
