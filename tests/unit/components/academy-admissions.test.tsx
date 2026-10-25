/** Exercises every admission route loading and error boundary through its real App Router entrypoint. @module academy-admissions-route-boundaries-tests */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { RECOVERED_SEGMENT_TEXT, renderThroughAppRouter, type RouteErrorBoundaryProps } from "@/tests/support/app-router-error-boundary";
import { describe, expect, it, vi } from "vitest";
import PublicAdmissionError from "@/app/(admission)/admissions/[slug]/error";
import PublicAdmissionLoading from "@/app/(admission)/admissions/[slug]/loading";
import LegacyArrivalLoading from "@/app/(admission)/admissions/[slug]/legacy/[token]/loading";
import PersonalInvitationError from "@/app/(admission)/admissions/invitations/[token]/error";
import PersonalInvitationLoading from "@/app/(admission)/admissions/invitations/[token]/loading";
import OwnRequestError from "@/app/(admission)/admissions/requests/[requestId]/error";
import OwnRequestLoading from "@/app/(admission)/admissions/requests/[requestId]/loading";
import ReviewError from "@/app/(platform)/[slug]/academia/admissions/error";
import ReviewLoading from "@/app/(platform)/[slug]/academia/admissions/loading";
import ActivityError from "@/app/(platform)/[slug]/academia/admissions/activity/error";
import ActivityLoading from "@/app/(platform)/[slug]/academia/admissions/activity/loading";
import AllowlistError from "@/app/(platform)/[slug]/academia/admissions/allowlist/error";
import AllowlistLoading from "@/app/(platform)/[slug]/academia/admissions/allowlist/loading";
import AllowlistImportError from "@/app/(platform)/[slug]/academia/admissions/allowlist/imports/error";
import AllowlistImportLoading from "@/app/(platform)/[slug]/academia/admissions/allowlist/imports/loading";
import HistoryError from "@/app/(platform)/[slug]/academia/admissions/history/[requestId]/error";
import HistoryLoading from "@/app/(platform)/[slug]/academia/admissions/history/[requestId]/loading";
import InvitationsError from "@/app/(platform)/[slug]/academia/admissions/invitations/error";
import InvitationsLoading from "@/app/(platform)/[slug]/academia/admissions/invitations/loading";
import UsageError from "@/app/(platform)/[slug]/academia/admissions/messaging/error";
import UsageLoading from "@/app/(platform)/[slug]/academia/admissions/messaging/loading";
import ConnectionsError from "@/app/(platform)/[slug]/academia/admissions/messaging/connections/error";
import ConnectionsLoading from "@/app/(platform)/[slug]/academia/admissions/messaging/connections/loading";
import NotificationsError from "@/app/(platform)/[slug]/academia/admissions/notifications/error";
import NotificationsLoading from "@/app/(platform)/[slug]/academia/admissions/notifications/loading";
import PolicyError from "@/app/(platform)/[slug]/academia/admissions/settings/error";
import PolicyLoading from "@/app/(platform)/[slug]/academia/admissions/settings/loading";
import { ADMISSION_PAGES, type AdmissionPage } from "@/src/modules/academy-admissions/constants/admission-sections";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { PERSONAL_INVITATION_UI_COPY } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";

type RouteErrorBoundary = ComponentType<RouteErrorBoundaryProps>;

/** A private cause that must never reach the rendered recovery surface. */
const PRIVATE_FAILURE_MESSAGE = "relation admission_requests leaked token=synthetic-private-value";

const LEADER_PAGE_BOUNDARIES: readonly [AdmissionPage, ComponentType, RouteErrorBoundary][] = [
  ["review", ReviewLoading, ReviewError],
  ["history", HistoryLoading, HistoryError],
  ["policy", PolicyLoading, PolicyError],
  ["allowlist", AllowlistLoading, AllowlistError],
  ["allowlistImport", AllowlistImportLoading, AllowlistImportError],
  ["invitations", InvitationsLoading, InvitationsError],
  ["usage", UsageLoading, UsageError],
  ["connections", ConnectionsLoading, ConnectionsError],
  ["notifications", NotificationsLoading, NotificationsError],
  ["activity", ActivityLoading, ActivityError],
];

const APPLICANT_ERROR_BOUNDARIES: readonly [string, RouteErrorBoundary][] = [
  ["public admission", PublicAdmissionError],
  ["personal invitation", PersonalInvitationError],
  ["own request", OwnRequestError],
];

/** Each applicant route keeps the title its loaded screen shows, so the page does not change name when it arrives. */
const APPLICANT_LOADING_TITLES: readonly [string, ComponentType, string, string][] = [
  ["public admission", PublicAdmissionLoading, ADMISSION_UI_COPY.title, ADMISSION_UI_COPY.reading],
  ["own request", OwnRequestLoading, ADMISSION_UI_COPY.statusTitle, ADMISSION_UI_COPY.reading],
  ["personal invitation", PersonalInvitationLoading, PERSONAL_INVITATION_UI_COPY.title, PERSONAL_INVITATION_UI_COPY.loading],
];

const APPLICANT_LOADING_BOUNDARIES: readonly [string, ComponentType][] = [
  ["public admission", PublicAdmissionLoading],
  ["legacy arrival", LegacyArrivalLoading],
  ["personal invitation", PersonalInvitationLoading],
  ["own request", OwnRequestLoading],
];

/** @returns A thrown render failure carrying private text and a digest, as App Router passes it. */
function createPrivateRenderFailure() {
  return Object.assign(new Error(PRIVATE_FAILURE_MESSAGE), { digest: "synthetic-digest" });
}

/** Asserts the boundary shows safe recovery and that keyboard activation of the retry re-fetches the segment and renders it again. */
async function expectKeyboardRecovery({ refresh, recover }: ReturnType<typeof renderThroughAppRouter>) {
  const user = userEvent.setup();
  expect(screen.getByRole("alert")).not.toHaveTextContent(PRIVATE_FAILURE_MESSAGE);
  expect(document.body).not.toHaveTextContent(PRIVATE_FAILURE_MESSAGE);
  expect(document.body).not.toHaveTextContent("synthetic-digest");
  expect(screen.getByRole("link", { name: ADMISSION_UI_COPY.home })).toBeInTheDocument();

  const retry = screen.getByRole("button", { name: "Reintentar" });
  await user.tab();
  expect(retry).toHaveFocus();
  recover();
  await act(async () => { await user.keyboard("{Enter}"); });
  // The framework retry re-requests the segment from the server and re-renders it: a plain reset would skip the refresh.
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(RECOVERED_SEGMENT_TEXT)).toBeInTheDocument();
}

describe("academy admission route boundaries", () => {
  it.each(LEADER_PAGE_BOUNDARIES)("should keep the %s heading and announce one loading status while the leader page reads", (page, Loading) => {
    render(<Loading />);

    const definition = ADMISSION_PAGES[page];
    const region = screen.getByRole("region", { name: definition.title });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(within(region).getByRole("heading", { level: 1, name: definition.title })).toBeInTheDocument();
    expect(within(region).getByRole("status")).toHaveTextContent(definition.loading);
  });

  it.each(LEADER_PAGE_BOUNDARIES)("should recover the %s page under its own heading without rendering the private failure", async (page, _Loading, ErrorBoundary) => {
    const boundary = renderThroughAppRouter(ErrorBoundary, createPrivateRenderFailure());

    const definition = ADMISSION_PAGES[page];
    const region = screen.getByRole("region", { name: definition.title });
    expect(within(region).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(region).getByRole("heading", { level: 1, name: definition.title })).toBeInTheDocument();
    expect(within(region).getByRole("heading", { level: 2, name: ADMISSION_UI_COPY.unavailableTitle })).toBeInTheDocument();
    await expectKeyboardRecovery(boundary);
  });

  it.each(APPLICANT_ERROR_BOUNDARIES)("should recover the %s route in one main landmark without rendering the private failure", async (_route, ErrorBoundary) => {
    const boundary = renderThroughAppRouter(ErrorBoundary, createPrivateRenderFailure());

    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: ADMISSION_UI_COPY.unavailableTitle })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(ADMISSION_UI_COPY.readFailed);
    await expectKeyboardRecovery(boundary);
  });

  it.each(APPLICANT_LOADING_BOUNDARIES)("should render the %s loading shell without actions that could submit stale state", (_route, Loading) => {
    render(<Loading />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it.each(APPLICANT_LOADING_TITLES)("should keep the %s title and announce its loading once", (_route, Loading, title, status) => {
    render(<Loading />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(status);
  });
});
