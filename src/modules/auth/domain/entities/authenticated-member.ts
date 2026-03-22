export type AuthenticatedMember = {
  id: string;
  name: string;
  role: string;
  avatarFallback: string;
  image: string | null;
};
