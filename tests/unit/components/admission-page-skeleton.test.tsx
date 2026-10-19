/** Exercises the admission loading skeletons served by the real route loading entrypoints. @module admission-page-skeleton-tests */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReviewLoading from "@/app/(platform)/[slug]/academia/admissions/loading";
import InvitationsLoading from "@/app/(platform)/[slug]/academia/admissions/invitations/loading";
import AllowlistImportLoading from "@/app/(platform)/[slug]/academia/admissions/allowlist/imports/loading";
import { ADMISSION_PAGES } from "@/src/modules/academy-admissions/constants/admission-sections";

describe("admission loading skeletons", () => {
  it.each([
    [ReviewLoading, ADMISSION_PAGES.review.loading],
    [InvitationsLoading, ADMISSION_PAGES.invitations.loading],
    [AllowlistImportLoading, ADMISSION_PAGES.allowlistImport.loading],
  ])("should announce one loading status and leave the heading and sections to the shared layout", (Loading, label) => {
    const { container } = render(<Loading />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
