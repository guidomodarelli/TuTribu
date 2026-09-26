import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MessageLikeButton } from "@/components/tribe-round/message-like-button";

function renderLikeButton({
  isDisabled = false,
  isLiked = false,
  likeCount = 2,
  onClick = vi.fn(),
}: {
  isDisabled?: boolean;
  isLiked?: boolean;
  likeCount?: number;
  onClick?: () => void;
} = {}) {
  return render(
    <MessageLikeButton
      ariaLabel={`Me gusta ${likeCount}`}
      className="TribeRound__likeButton"
      isDisabled={isDisabled}
      isLiked={isLiked}
      likeCount={likeCount}
      onClick={onClick}
    />
  );
}

describe("MessageLikeButton", () => {
  it("exposes the like state as a pressed toggle and forwards clicks", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    renderLikeButton({ isLiked: true, likeCount: 3, onClick: handleClick });

    const likeButton = screen.getByRole("button", { name: "Me gusta 3" });

    expect(likeButton).toHaveAttribute("aria-pressed", "true");
    expect(likeButton).toHaveClass("TribeRound__likeButton");
    expect(likeButton).toHaveTextContent("3");

    await user.click(likeButton);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("settles on the new count after the viewer likes the message", async () => {
    const { rerender } = renderLikeButton({ likeCount: 2 });

    expect(screen.getByRole("button", { name: "Me gusta 2" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    rerender(
      <MessageLikeButton
        ariaLabel="Me gusta 3"
        className="TribeRound__likeButton"
        isDisabled={false}
        isLiked
        likeCount={3}
        onClick={vi.fn()}
      />
    );

    const likeButton = screen.getByRole("button", { name: "Me gusta 3" });

    expect(likeButton).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(likeButton).toHaveTextContent(/^3$/);
    });
  });

  it("does not react to clicks while disabled", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    renderLikeButton({ isDisabled: true, onClick: handleClick });

    const likeButton = screen.getByRole("button", { name: "Me gusta 2" });

    expect(likeButton).toBeDisabled();

    await user.click(likeButton);

    expect(handleClick).not.toHaveBeenCalled();
  });
});
