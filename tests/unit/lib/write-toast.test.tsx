/** Exercises one write's toast lifecycle through the real Sonner toaster. @module write-toast-tests */
import { act, render, screen, waitFor } from "@testing-library/react";
import { ThemedToaster } from "@golfo/ui";
import { describe, expect, it } from "vitest";
import { startWriteToast, WRITE_TOAST_SILENT } from "@/lib/toasts/write-toast";

describe("write toast", () => {
  it("should replace the loading toast with the confirmed success", async () => {
    render(<ThemedToaster />);
    let notice: ReturnType<typeof startWriteToast> | null = null;
    act(() => { notice = startWriteToast("Guardando la entrada…"); });
    expect(await screen.findByText("Guardando la entrada…")).toBeInTheDocument();
    act(() => { notice!.announce({ kind: "success", message: "La entrada quedó guardada." }); notice!.finish(); });
    expect(await screen.findByText("La entrada quedó guardada.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Guardando la entrada…")).not.toBeInTheDocument());
  });

  it("should show the write's own failure message", async () => {
    render(<ThemedToaster />);
    act(() => { const notice = startWriteToast("Creando la vista previa…"); notice.announce({ kind: "error", message: "El archivo cambió. Volvé a elegirlo." }); notice.finish(); });
    expect(await screen.findByText("El archivo cambió. Volvé a elegirlo.")).toBeInTheDocument();
  });

  it("should dismiss the loading toast when the screen keeps the state itself", async () => {
    render(<ThemedToaster />);
    let notice: ReturnType<typeof startWriteToast> | null = null;
    act(() => { notice = startWriteToast("Enviando la solicitud…"); });
    expect(await screen.findByText("Enviando la solicitud…")).toBeInTheDocument();
    act(() => { notice!.announce(WRITE_TOAST_SILENT); notice!.finish(); notice!.announce({ kind: "success", message: "Tarde" }); notice!.finish(); });
    await waitFor(() => expect(screen.queryByText("Enviando la solicitud…")).not.toBeInTheDocument());
    expect(screen.queryByText("Tarde")).not.toBeInTheDocument();
  });
});
