/** Defines authorized public metadata, independent of private tokens, fingerprints or storage rows. */
export type AllowlistEntryResult = {
  id: string; version: number; contactType: "email" | "phone"; identity: string;
  displayName?: string | null; status: "enabled" | "disabled"; source: "manual" | "csv";
  createdAt: string; updatedAt: string;
};
export type PersonalInvitationResult = {
  id: string; version: number; internalName: string;
  recipient: { type: "email" | "phone"; value: string; country?: string };
  requiresAllowlist: boolean; expiresAt: string | null;
  status: "active" | "revoked" | "expired" | "redeemed";
};
