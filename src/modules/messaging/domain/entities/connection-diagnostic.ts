/** Defines exact locally confirmed capability evidence, independent of delivery receipts and admission proof. @module connection-diagnostic */

/** Contains no recipient, code, MAC, envelope, provider credential or admission proof. */
export type ConnectionDiagnostic = {
  id: string; tribeId: string; connectionId: string; connectionVersion: number; leaderUserId: string;
  channel: "email" | "sms" | "whatsapp"; senderId: string; templateId: string | null; templateLanguage: string | null;
  outcome: "pending" | "verified" | "failed" | "expired" | "invalidated"; validatedAt: Date | null;
};
