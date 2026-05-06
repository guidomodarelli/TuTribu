import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreateCommunityForm } from "@/components/communities/create-community-form";

describe("CreateCommunityForm", () => {
  it("suggests a slug from the community name", async () => {
    const user = userEvent.setup();

    render(<CreateCommunityForm submitPath="/tribu/crear" />);

    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Algebra");

    expect(screen.getByLabelText(/slug/i)).toHaveValue("tribu-de-algebra");
    expect(screen.getByText(/\/tribu\/tribu-de-algebra/i)).toBeInTheDocument();
    expect(screen.getByText(/^sincronizado$/i)).toBeInTheDocument();
  });

  it("stops syncing the slug once the user edits it manually", async () => {
    const user = userEvent.setup();

    render(<CreateCommunityForm submitPath="/tribu/crear" />);

    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Algebra");
    await user.clear(screen.getByLabelText(/slug/i));
    await user.type(screen.getByLabelText(/slug/i), "algebra-pro");
    await user.clear(screen.getByLabelText(/nombre de la tribu/i));
    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Historia");

    expect(screen.getByLabelText(/slug/i)).toHaveValue("algebra-pro");
    expect(screen.getByText(/^editado$/i)).toBeInTheDocument();
  });

  it("lets the user resync the slug from the community name", async () => {
    const user = userEvent.setup();

    render(<CreateCommunityForm submitPath="/tribu/crear" />);

    await user.type(screen.getByLabelText(/nombre de la tribu/i), "Tribu de Algebra");
    await user.clear(screen.getByLabelText(/slug/i));
    await user.type(screen.getByLabelText(/slug/i), "algebra-pro");
    await user.click(screen.getByRole("button", { name: /sincronizar con el nombre/i }));

    expect(screen.getByLabelText(/slug/i)).toHaveValue("tribu-de-algebra");
    expect(screen.getByText(/\/tribu\/tribu-de-algebra/i)).toBeInTheDocument();
    expect(screen.getByText(/^sincronizado$/i)).toBeInTheDocument();
  });

  it("lets the user apply the suggested slug from a conflict response", async () => {
    const user = userEvent.setup();

    render(
      <CreateCommunityForm
        errorMessage="Ese slug ya esta en uso. Puedes probar con la sugerencia."
        initialName="Matematica Pro"
        initialSlug="matematica-pro"
        submitPath="/tribu/crear"
        suggestedSlug="matematica-pro-2"
      />
    );

    expect(
      screen.getByText(/ese slug ya esta en uso\. puedes probar con la sugerencia\./i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /usar sugerencia/i }));

    expect(screen.getByLabelText(/slug/i)).toHaveValue("matematica-pro-2");
  });

  it("keeps the slug canonical when the user types a trailing separator", async () => {
    const user = userEvent.setup();

    render(<CreateCommunityForm submitPath="/tribu/crear" />);

    await user.type(screen.getByLabelText(/slug/i), "matematica-pro-");
    expect(screen.getByDisplayValue("matematica-pro-")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("matematica-pro", {
        selector: 'input[type="hidden"][name="slug"]',
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/\/tribu\/matematica-pro/i)).toBeInTheDocument();

    await user.tab();

    expect(screen.getByLabelText(/slug/i)).toHaveValue("matematica-pro");
  });
});
