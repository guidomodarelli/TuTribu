import { dismissOpenSitepingCommentForm } from "@/components/providers/siteping-provider/siteping-comment-form";

/**
 * Builds a stand-in for SitePing's comment form: a `data-siteping-ignore` panel
 * with a textarea and the [...type buttons, discard, submit] action layout.
 */
function renderCommentForm(): { discard: HTMLButtonElement; submit: HTMLButtonElement } {
  const panel = document.createElement("div");
  panel.setAttribute("data-siteping-ignore", "true");
  panel.appendChild(document.createElement("textarea"));

  const typeButton = document.createElement("button");
  typeButton.textContent = "Pregunta";
  const discard = document.createElement("button");
  discard.textContent = "Cancelar";
  const submit = document.createElement("button");
  submit.textContent = "Enviar";

  panel.append(typeButton, discard, submit);
  document.body.appendChild(panel);
  return { discard, submit };
}

describe("dismissOpenSitepingCommentForm", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("triggers the discard control of an open comment form", () => {
    const { discard, submit } = renderCommentForm();
    const discardClick = jest.fn();
    const submitClick = jest.fn();
    discard.addEventListener("click", discardClick);
    submit.addEventListener("click", submitClick);

    dismissOpenSitepingCommentForm();

    expect(discardClick).toHaveBeenCalledTimes(1);
    expect(submitClick).not.toHaveBeenCalled();
  });

  it("does nothing when the comment form is hidden (already closed)", () => {
    const { discard } = renderCommentForm();
    (discard.closest("[data-siteping-ignore]") as HTMLElement).style.display =
      "none";
    const discardClick = jest.fn();
    discard.addEventListener("click", discardClick);

    dismissOpenSitepingCommentForm();

    expect(discardClick).not.toHaveBeenCalled();
  });

  it("ignores SitePing panels that are not the comment form", () => {
    const listPanel = document.createElement("div");
    listPanel.setAttribute("data-siteping-ignore", "true");
    const searchInput = document.createElement("input");
    const onlyButton = document.createElement("button");
    onlyButton.textContent = "Buscar";
    const clicked = jest.fn();
    onlyButton.addEventListener("click", clicked);
    listPanel.append(searchInput, onlyButton);
    document.body.appendChild(listPanel);

    dismissOpenSitepingCommentForm();

    expect(clicked).not.toHaveBeenCalled();
  });

  it("is a no-op when no SitePing form is present", () => {
    expect(() => dismissOpenSitepingCommentForm()).not.toThrow();
  });
});
