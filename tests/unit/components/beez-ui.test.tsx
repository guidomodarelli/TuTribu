/** Verifies the distributed UI package through its public consumer contract. */
import { vi, describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "@/components/navigation/link";
import { Button, Avatar, AvatarImage, Checkbox } from "beez-ui";



describe("beez-ui consumer contract", () => {
  it("should preserve asChild navigation without nesting a button", () => {
    render(<Button asChild><Link href="/courses">Cursos</Link></Button>);
    expect(screen.getByRole("link", { name: "Cursos" })).toHaveAttribute("href", "/courses");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should prevent actions when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Guardar</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should hide a failed avatar from assistive technology and retry when its source changes", () => {
    const { rerender } = render(<Avatar><AvatarImage src="/first.png" alt="Perfil" /></Avatar>);
    fireEvent.error(screen.getByAltText("Perfil"));
    expect(screen.queryByRole("img", { name: "Perfil" })).not.toBeInTheDocument();
    rerender(<Avatar><AvatarImage src="/second.png" alt="Perfil" /></Avatar>);
    fireEvent.load(screen.getByAltText("Perfil"));
    expect(screen.getByRole("img", { name: "Perfil" })).toBeInTheDocument();
    expect((screen.getByAltText("Perfil") as HTMLImageElement).src).toBe(new URL("/second.png", window.location.href).href);
  });

  it("should preserve checkbox interaction", async () => {
    render(<Checkbox aria-label="Aceptar" />);
    const checkbox = screen.getByRole("checkbox", { name: "Aceptar" });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
