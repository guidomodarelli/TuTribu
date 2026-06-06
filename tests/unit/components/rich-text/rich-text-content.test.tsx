import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RichTextContent } from "@/components/rich-text/rich-text-content";

describe("RichTextContent", () => {
  it("renders plain text without links", () => {
    render(<RichTextContent content="hola mundo" />);

    expect(screen.getByText("hola mundo")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("auto-detects a bare URL as a safe external link", () => {
    render(<RichTextContent content="entrá a https://tutribu.com ahora" />);

    const link = screen.getByRole("link", { name: "https://tutribu.com" });
    expect(link).toHaveAttribute("href", "https://tutribu.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("renders a markdown link with custom text", () => {
    render(<RichTextContent content="[el curso](https://tutribu.com)" />);

    const link = screen.getByRole("link", { name: "el curso" });
    expect(link).toHaveAttribute("href", "https://tutribu.com");
  });

  it("invokes onLinkClick when a link is clicked", async () => {
    const user = userEvent.setup();
    const handleLinkClick = jest.fn((event) => event.preventDefault());

    render(
      <RichTextContent
        content="https://tutribu.com"
        onLinkClick={handleLinkClick}
      />
    );

    await user.click(screen.getByRole("link"));

    expect(handleLinkClick).toHaveBeenCalledTimes(1);
  });
});
