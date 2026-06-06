import { render, screen } from "@testing-library/react";
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

function EditorHarness({ initialMarkdown }: { initialMarkdown?: string }) {
  const editor = useRichLinkEditor({ initialMarkdown });
  const [serialized, setSerialized] = useState<string | null>(null);

  return (
    <>
      <RichLinkEditor
        ariaLabel="Editor de prueba"
        copy={COPY}
        editor={editor}
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
});
