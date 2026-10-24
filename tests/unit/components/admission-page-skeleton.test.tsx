/** Exercises the admission loading skeletons served by the real route loading entrypoints. @module admission-page-skeleton-tests */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReviewLoading from "@/app/(platform)/[slug]/academia/admissions/loading";
import InvitationsLoading from "@/app/(platform)/[slug]/academia/admissions/invitations/loading";
import AllowlistImportLoading from "@/app/(platform)/[slug]/academia/admissions/allowlist/imports/loading";
import { ADMISSION_PAGES } from "@/src/modules/academy-admissions/constants/admission-sections";

describe("admission loading skeletons", () => {
  it.each([
    [ReviewLoading, ADMISSION_PAGES.review],
    [InvitationsLoading, ADMISSION_PAGES.invitations],
    [AllowlistImportLoading, ADMISSION_PAGES.allowlistImport],
  ])("should show the page heading at once and announce one loading status while the page reads", (Loading, definition) => {
    render(<Loading />);

    const region = screen.getByRole("region", { name: definition.title });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(within(region).getByRole("heading", { level: 1, name: definition.title })).toBeInTheDocument();
    expect(within(region).getByText(definition.description)).toBeInTheDocument();
    expect(within(region).getAllByRole("status")).toHaveLength(1);
    expect(within(region).getByRole("status")).toHaveTextContent(definition.loading);
    expect(within(region).queryByRole("link")).not.toBeInTheDocument();
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
  });
});
