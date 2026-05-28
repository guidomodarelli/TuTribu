export type TribeMemberRole = "guardian" | "leader" | "tribemate";

export type TribeMemberResult = {
  avatarFallback: string;
  email: string | null;
  id: string;
  image: string | null;
  name: string;
  role: TribeMemberRole;
};
