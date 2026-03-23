export type AuthenticatedMemberResult = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarFallback: string;
  image: string | null;
};
