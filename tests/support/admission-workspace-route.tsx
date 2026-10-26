/** Mounts admission content inside the real admissions layout frame with the framework's own route contexts. @module admission-workspace-route */
import type { ReactNode } from "react";
import { PathnameContext, PathParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AdmissionWorkspaceFrame } from "@/components/academy-admissions/admission-workspace-frame";
import { MemberTribesProvider } from "@/components/platform/member-tribes-provider";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";

/**
 * @param props - Route pathname and slug as Next resolves them, the member's tribes from the platform layout, and the page.
 * @returns The page under the same frame the admissions layout renders.
 */
export function AdmissionWorkspaceRoute({ pathname, slug, memberTribes = [], children }: { pathname: string; slug: string; memberTribes?: readonly MemberTribeListItemResult[]; children: ReactNode }) {
  return <PathnameContext.Provider value={pathname}>
    <PathParamsContext.Provider value={{ slug }}>
      <MemberTribesProvider memberTribes={memberTribes}>
        <AdmissionWorkspaceFrame>{children}</AdmissionWorkspaceFrame>
      </MemberTribesProvider>
    </PathParamsContext.Provider>
  </PathnameContext.Provider>;
}

/** @param overrides - Fields of the member's tribe to change. @returns A member tribe as the platform layout loads it. */
export function buildAdmissionMemberTribe(overrides: Partial<MemberTribeListItemResult> = {}): MemberTribeListItemResult {
  return { accessModel: "academy", logoUrl: null, membershipStatus: "active", name: "Tribu", role: "leader", slug: "tribu", tribeId: "tribe-1", ...overrides };
}
