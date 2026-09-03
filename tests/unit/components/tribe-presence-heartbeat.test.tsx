import { act, render } from "@testing-library/react";

import { TribePresenceHeartbeat } from "@/components/tribes/tribe-presence-heartbeat";

const useParamsMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
}));

describe("TribePresenceHeartbeat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("touches the presence endpoint of the route slug on mount and every minute", () => {
    useParamsMock.mockReturnValue({ slug: "matematica-pro" });

    render(<TribePresenceHeartbeat />);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/presence",
      expect.objectContaining({ method: "POST" })
    );

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("stays idle when the route has no tribe slug", () => {
    useParamsMock.mockReturnValue({});

    render(<TribePresenceHeartbeat />);

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("stops the heartbeat when unmounted", () => {
    useParamsMock.mockReturnValue({ slug: "matematica-pro" });

    const { unmount } = render(<TribePresenceHeartbeat />);

    unmount();
    act(() => {
      jest.advanceTimersByTime(120000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
