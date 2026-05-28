import type { TribeMemberRole } from "@/src/modules/tribes/application/results/tribe-member-result";

export const TRIBE_MEMBER_ROLE = {
  guardian: "guardian",
  leader: "leader",
  tribemate: "tribemate",
} as const;

export const TRIBE_MEMBER_PRIVILEGED_ROLES = new Set<TribeMemberRole>([
  TRIBE_MEMBER_ROLE.guardian,
  TRIBE_MEMBER_ROLE.leader,
]);

export function isPrivilegedTribeMemberRole(
  role: TribeMemberRole | null | undefined
): role is "guardian" | "leader" {
  return role != null && TRIBE_MEMBER_PRIVILEGED_ROLES.has(role);
}
