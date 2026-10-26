"use client";

/** Shares the member's tribes loaded by the platform layout, so page-level navigation follows the same roles as the app rail. @module member-tribes-provider */
import { createContext, useContext, type ReactNode } from "react";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";

const MemberTribesContext = createContext<readonly MemberTribeListItemResult[] | null>(null);

/**
 * @param props - The member's tribes as the layout resolved them for this request, and the platform content.
 * @returns The content with read access to those tribes; it grants nothing, since every page authorizes again on the server.
 */
export function MemberTribesProvider({ memberTribes, children }: { memberTribes: readonly MemberTribeListItemResult[]; children: ReactNode }) {
  return <MemberTribesContext.Provider value={memberTribes}>{children}</MemberTribesContext.Provider>;
}

/**
 * @param slug - Slug of the tribe the page belongs to.
 * @returns The member's entry for that tribe, or undefined outside the platform layout or for tribes the member is not in.
 */
export function useMemberTribe(slug: string | undefined): MemberTribeListItemResult | undefined {
  const memberTribes = useContext(MemberTribesContext);
  return slug ? memberTribes?.find((tribe) => tribe.slug === slug) : undefined;
}
