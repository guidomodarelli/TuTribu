export type TribeMemberRole = "guardian" | "leader" | "tribemate";

export type TribeMemberResult = {
  avatarFallback: string;
  email: string | null;
  id: string;
  image: string | null;
  /**
   * Whether the member joined the tribe through a free invitation. Only
   * disclosed to viewers allowed to see free-invitation status (tribe leaders);
   * scrubbed to `false` for everyone else.
   */
  joinedViaFreeInvitation: boolean;
  name: string;
  role: TribeMemberRole;
};
