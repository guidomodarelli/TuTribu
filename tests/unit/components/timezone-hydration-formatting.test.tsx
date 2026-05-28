import type { ReactElement, ReactNode } from "react";
import { render as renderComponent, screen } from "@testing-library/react";

import { TooltipProvider } from "@/components/ui/tooltip";

const refreshMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

class ImageMock {
  complete = true;

  naturalWidth = 1;

  onerror: (() => void) | null = null;

  onload: (() => void) | null = null;

  private source = "";

  get src() {
    return this.source;
  }

  set src(nextSource: string) {
    this.source = nextSource;
    this.onload?.();
  }
}

globalThis.Image = ImageMock as unknown as typeof Image;

const originalTimeZone = process.env.TZ;
const OriginalDateTimeFormat = Intl.DateTimeFormat;

function renderWithTooltipProvider(ui: ReactElement) {
  return renderComponent(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <TooltipProvider>{children}</TooltipProvider>
    ),
  });
}

describe("timezone-stable hydration formatting", () => {
  beforeAll(() => {
    process.env.TZ = "UTC";
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: function DateTimeFormat(
        locale?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions
      ) {
        const formatterOptions =
          options && !("timeZone" in options)
            ? { ...options, timeZone: "UTC" }
            : options;

        return new OriginalDateTimeFormat(locale, formatterOptions);
      },
    });
  });

  afterAll(() => {
    process.env.TZ = originalTimeZone;
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: OriginalDateTimeFormat,
    });
  });

  it("renders invitation creation dates in Buenos Aires time", async () => {
    const { TribeInvitationManagement } = await import(
      "@/components/tribes/tribe-invitation-management"
    );

    renderComponent(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[
          {
            campaignName: null,
            channel: null,
            createdAt: "2026-04-26T02:30:00.000Z",
            createdByName: "Grace Hopper",
            id: "invitation-1",
            invitationUrl:
              "https://tutribu.example.com/matematica-pro/invitar/token",
            referrerHandle: null,
            subscriptionAssociation: { type: "current" },
          },
        ]}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByText(/Grace Hopper · 25 abr 2026, 23:30/i)
    ).toBeInTheDocument();
  });

  it("renders tribe round message timestamps in Buenos Aires time", async () => {
    const { TribeRound } = await import("@/components/tribe-round/tribe-round");

    renderWithTooltipProvider(
      <TribeRound
        authenticatedMember={{
          avatarFallback: "GH",
          email: "grace.hopper@example.com",
          id: "member-1",
          image: null,
          name: "Grace Hopper",
          role: "tribemate",
        }}
        tribeSlug="matematica-pro"
        round={{
          activeChannelId: null,
          channels: [
            {
              accessScope: "tribemates",
              emoji: "🔥",
              id: "channel-ronda",
              name: "Ronda",
              slug: "ronda",
              sortOrder: 10,
            },
          ],
          messages: [
            {
              author: {
                avatarFallback: "AL",
                id: "leader-1",
                image: null,
                name: "Ada Lovelace",
                role: "leader",
              },
              channel: {
                accessScope: "tribemates",
                emoji: "🔥",
                id: "channel-ronda",
                name: "Ronda",
                slug: "ronda",
                sortOrder: 10,
              },
              content: "Bienvenida a la tribu",
              createdAt: "2026-04-26T02:30:00.000Z",
              id: "message-1",
              likeCount: 0,
              likedByViewer: false,
              replies: [],
              title: "Anuncio inicial",
            },
          ],
          pagination: {
            currentPage: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            pageSize: 15,
          },
          viewerPermissions: {
            canCreateMessage: true,
            canPinMessages: true,
            canReact: true,
            canReply: true,
          },
        }}
      />
    );

    expect(screen.getByText("25 abr")).toBeInTheDocument();
  });
});
