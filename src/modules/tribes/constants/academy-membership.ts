/** Names basic admission outcomes independently of transport and paid entitlements. */
export const ACADEMY_MEMBERSHIP_ELIGIBILITY={create:"create",recover:"recover",blocked:"blocked",alreadyMember:"already_member"} as const;
/** Names persisted decision authority consumed by the membership owner. */
export const ACADEMY_MEMBERSHIP_DECISION={approved:"approved",user:"user",system:"system"} as const;
