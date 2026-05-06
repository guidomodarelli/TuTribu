import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PostCategoryManagement } from "@/components/tribe-feed/post-category-management";

const postCategoryManagementStyles = readFileSync(
  join(
    process.cwd(),
    "components",
    "tribe-feed",
    "post-category-management",
    "styles.module.scss"
  ),
  "utf8"
);

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const categories = [
  {
    accessScope: "members" as const,
    emoji: "💬",
    id: "category-general",
    name: "General",
    slug: "general",
    sortOrder: 10,
  },
  {
    accessScope: "members" as const,
    emoji: "📚",
    id: "category-resources",
    name: "Recursos",
    slug: "recursos",
    sortOrder: 20,
  },
];

describe("PostCategoryManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders category controls in a responsive management layout", () => {
    render(
      <PostCategoryManagement
        categories={categories}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByRole("heading", { name: "Categorías" })).toBeInTheDocument();
    const createCategoryButton = screen.getByRole("button", {
      name: "Crear categoría",
    });

    expect(createCategoryButton).toHaveClass("PostCategoryManagement__createButton");
    expect(createCategoryButton).toHaveAttribute("type", "submit");

    const categoryList = screen.getByRole("list", {
      name: "Categorías configuradas",
    });
    const generalCategoryItem = within(categoryList)
      .getByDisplayValue("General")
      .closest("li");

    expect(categoryList).toHaveClass("PostCategoryManagement__list");
    expect(generalCategoryItem).not.toBeNull();
    expect(generalCategoryItem).toHaveClass("PostCategoryManagement__item");
    expect(
      within(generalCategoryItem as HTMLElement).getByRole("group", {
        name: "Acciones de General",
      })
    ).toHaveClass("PostCategoryManagement__actions");
  });

  it("keeps the category form fluid across mobile and desktop widths", () => {
    expect(postCategoryManagementStyles).toMatch(
      /\.PostCategoryManagement\s*{[^}]*max-width:\s*min\(100%,\s*980px\);/s
    );
    expect(postCategoryManagementStyles).toMatch(
      /\.PostCategoryManagement\s*{[^}]*width:\s*100%;/s
    );
    expect(postCategoryManagementStyles).toMatch(
      /&__createForm\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
    );
    expect(postCategoryManagementStyles).toMatch(
      /&__item\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
    );
    expect(postCategoryManagementStyles).toMatch(
      /&__actions\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(postCategoryManagementStyles).toMatch(
      /@media\s*\(min-width:\s*56rem\)\s*{[^}]*\.PostCategoryManagement/s
    );
    expect(postCategoryManagementStyles).toMatch(
      /&__createForm\s*{[^}]*grid-template-columns:\s*minmax\(4\.5rem,\s*0\.18fr\)\s*minmax\(12rem,\s*1fr\)\s*max-content;/s
    );
    expect(postCategoryManagementStyles).toMatch(
      /&__item\s*{[^}]*grid-template-columns:\s*minmax\(4\.5rem,\s*0\.16fr\)\s*minmax\(10rem,\s*0\.58fr\)\s*minmax\(12rem,\s*1fr\)\s*max-content;/s
    );
  });

  it("cleans stale target categories after deleting a category", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: "Categoría eliminada.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: "Categoría eliminada.",
        }),
      });

    const user = userEvent.setup();

    render(
      <PostCategoryManagement
        categories={categories}
        tribeSlug="matematica-pro"
      />
    );

    const categoryList = screen.getByRole("list", {
      name: "Categorías configuradas",
    });
    const generalCategoryItem = within(categoryList)
      .getByDisplayValue("General")
      .closest("li") as HTMLElement;
    const resourcesCategoryItem = within(categoryList)
      .getByDisplayValue("Recursos")
      .closest("li") as HTMLElement;

    await user.selectOptions(
      within(resourcesCategoryItem).getByRole("combobox", {
        name: "Mover publicaciones a",
      }),
      "category-general"
    );

    await user.click(
      within(generalCategoryItem).getByRole("button", {
        name: "Eliminar",
      })
    );

    await user.click(
      within(resourcesCategoryItem).getByRole("button", {
        name: "Eliminar",
      })
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[1][1].body).toBeUndefined();
  });

  it("keeps the selected target category when deleting a category with posts", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: "Categoría eliminada.",
      }),
    });

    const user = userEvent.setup();

    render(
      <PostCategoryManagement
        categories={categories}
        tribeSlug="matematica-pro"
      />
    );

    const categoryList = screen.getByRole("list", {
      name: "Categorías configuradas",
    });
    const resourcesCategoryItem = within(categoryList)
      .getByDisplayValue("Recursos")
      .closest("li") as HTMLElement;

    await user.selectOptions(
      within(resourcesCategoryItem).getByRole("combobox", {
        name: "Mover publicaciones a",
      }),
      "category-general"
    );

    await user.click(
      within(resourcesCategoryItem).getByRole("button", {
        name: "Eliminar",
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/post-categories/category-resources",
      expect.objectContaining({
        body: JSON.stringify({ targetCategoryId: "category-general" }),
        method: "DELETE",
      })
    );
  });
});
