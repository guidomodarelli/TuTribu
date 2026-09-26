import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { RichLinkEditor } from "@/components/rich-text/rich-link-editor";
import { useRichLinkEditor } from "@/components/rich-text/rich-link-editor/use-rich-link-editor";

const COPY = {
  editAction: "Editar",
  editCancel: "Cancelar",
  editSave: "Guardar",
  popoverTextLabel: "Texto del link",
  popoverUrlLabel: "Link",
  removeAction: "Remover",
};

const SERIALIZE_BUTTON_LABEL = "serializar";
const SERIALIZED_TEST_ID = "serialized";

function EditorHarness({
  initialMarkdown,
  isDisabled,
}: {
  initialMarkdown?: string;
  isDisabled?: boolean;
}) {
  const editor = useRichLinkEditor({ initialMarkdown });
  const [serialized, setSerialized] = useState<string | null>(null);

  return (
    <>
      <RichLinkEditor
        ariaLabel="Editor de prueba"
        copy={COPY}
        editor={editor}
        isDisabled={isDisabled}
        placeholder="Escribí algo"
      />
      <button
        onClick={() => setSerialized(editor.serialize())}
        type="button"
      >
        {SERIALIZE_BUTTON_LABEL}
      </button>
      {serialized === null ? null : (
        <output data-testid={SERIALIZED_TEST_ID}>{serialized}</output>
      )}
    </>
  );
}

async function serialize(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: SERIALIZE_BUTTON_LABEL }));
  return screen.getByTestId(SERIALIZED_TEST_ID).textContent;
}

describe("RichLinkEditor", () => {
  it("renders an existing markdown link and serializes it back to markdown", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="mirá [el curso](https://tutribu.com)" />);

    expect(screen.getByRole("link", { name: "el curso" })).toBeInTheDocument();
    expect(await serialize(user)).toBe("mirá [el curso](https://tutribu.com)");
  });

  it("edits a link target through the popover", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="[el curso](https://tutribu.com)" />);

    await user.click(screen.getByRole("link", { name: "el curso" }));
    await user.click(screen.getByRole("button", { name: COPY.editAction }));

    const urlInput = screen.getByLabelText(COPY.popoverUrlLabel);
    await user.clear(urlInput);
    await user.type(urlInput, "https://tutribu.com/nuevo");
    await user.click(screen.getByRole("button", { name: COPY.editSave }));

    expect(await serialize(user)).toBe("[el curso](https://tutribu.com/nuevo)");
  });

  it("removes a link through the popover", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="[el curso](https://tutribu.com)" />);

    await user.click(screen.getByRole("link", { name: "el curso" }));
    await user.click(screen.getByRole("button", { name: COPY.removeAction }));

    expect(
      screen.queryByRole("link", { name: "el curso" })
    ).not.toBeInTheDocument();
    expect(await serialize(user)).toBe("el curso");
  });

  it("keeps a browser-native edit that only fires an input event after handled typing", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    const editor = screen.getByRole("textbox");

    // Normal typing is handled by keydown, which prevents the browser edit and
    // therefore suppresses its input event.
    fireEvent.keyDown(editor, { key: "h" });

    // A composition/autocorrect or other browser-native mutation reaches the
    // editor through an input event without a preceding handled keydown.
    editor.textContent = "ho";
    fireEvent.input(editor);

    expect(await serialize(user)).toBe("ho");
  });

  it("keeps a browser-native edit that only fires an input event after a handled deletion", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="hola" />);

    const editor = screen.getByRole("textbox");

    fireEvent.keyDown(editor, { key: "Backspace" });

    editor.textContent = "holX";
    fireEvent.input(editor);

    expect(await serialize(user)).toBe("holX");
  });

  it("renders whitespace-only content instead of hiding it behind the placeholder", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="   " />);

    const editor = screen.getByRole("textbox");

    // The spaces must reach the DOM so the caret and selection have real text
    // to land on; otherwise the editor shows the placeholder while still
    // holding hidden spaces in its state.
    expect(editor.textContent).toBe("   ");
    expect(await serialize(user)).toBe("   ");
  });

  it("deletes whitespace-only content with Backspace from the live selection", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="   " />);

    const editor = screen.getByRole("textbox") as HTMLDivElement;
    editor.focus();

    const selection = window.getSelection();
    const caretRange = document.createRange();
    caretRange.selectNodeContents(editor);
    caretRange.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(caretRange);

    fireEvent.keyDown(editor, { key: "Backspace" });

    // Backspace must remove a real space at the caret, not no-op against an
    // empty DOM selection that leaves the hidden spaces stuck.
    expect(await serialize(user)).toBe("  ");
  });

  it("keeps showing the link but does not open its popover while disabled", async () => {
    const user = userEvent.setup();
    render(
      <EditorHarness
        initialMarkdown="[el curso](https://tutribu.com)"
        isDisabled
      />
    );

    await user.click(screen.getByRole("link", { name: "el curso" }));

    expect(
      screen.queryByRole("button", { name: COPY.editAction })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.removeAction })
    ).not.toBeInTheDocument();
  });

  it("closes an open link popover when the editor becomes disabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <EditorHarness initialMarkdown="[el curso](https://tutribu.com)" />
    );

    await user.click(screen.getByRole("link", { name: "el curso" }));
    expect(
      screen.getByRole("button", { name: COPY.editAction })
    ).toBeInTheDocument();

    rerender(
      <EditorHarness initialMarkdown="[el curso](https://tutribu.com)" isDisabled />
    );

    expect(
      screen.queryByRole("button", { name: COPY.editAction })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.removeAction })
    ).not.toBeInTheDocument();
  });

  it("moves focus into the link text field when switching to the edit form", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="[el curso](https://tutribu.com)" />);

    await user.click(screen.getByRole("link", { name: "el curso" }));
    await user.click(screen.getByRole("button", { name: COPY.editAction }));

    expect(screen.getByLabelText(COPY.popoverTextLabel)).toHaveFocus();
  });

  it("saves the link edit with Enter from a popover field", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="[el curso](https://tutribu.com)" />);

    await user.click(screen.getByRole("link", { name: "el curso" }));
    await user.click(screen.getByRole("button", { name: COPY.editAction }));

    const urlInput = screen.getByLabelText(COPY.popoverUrlLabel);
    await user.clear(urlInput);
    await user.type(urlInput, "https://tutribu.com/enter{Enter}");

    expect(
      screen.queryByRole("button", { name: COPY.editSave })
    ).not.toBeInTheDocument();
    expect(await serialize(user)).toBe("[el curso](https://tutribu.com/enter)");
  });

  it("blocks saving a link edit whose URL is not a valid web address", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialMarkdown="[el curso](https://tutribu.com)" />);

    await user.click(screen.getByRole("link", { name: "el curso" }));
    await user.click(screen.getByRole("button", { name: COPY.editAction }));

    const urlInput = screen.getByLabelText(COPY.popoverUrlLabel);
    await user.clear(urlInput);
    await user.type(urlInput, "no es un link{Enter}");

    expect(urlInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: COPY.editSave })).toBeDisabled();

    await user.clear(urlInput);
    await user.type(urlInput, "https://tutribu.com/valido");

    expect(urlInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("button", { name: COPY.editSave })).toBeEnabled();
  });
});
