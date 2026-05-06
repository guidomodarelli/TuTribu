export type TribeMemberRole = "guardian" | "leader" | "tribemate";

export type TribeMemberResult = {
  avatarFallback: string;
  id: string;
  image: string | null;
  name: string;
  role: TribeMemberRole;
};
