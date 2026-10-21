/** Exercises the guided flow's step writes and collapsed secondary actions with real shared controls. @module guided-steps-tests */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuidedSteps, type GuidedStep } from "@/components/forms/guided-steps";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";

/**
 * @param props - Whether the step write has landed and the callbacks under test.
 * @returns A three-step flow whose second step owns a write, controlled like a container would.
 */
function Flow({ written, onWrite, onFinish, onRecover }: { written: boolean; onWrite: () => void; onFinish: () => void; onRecover: () => void }) {
  const [current, setCurrent] = useState(0);
  const steps: GuidedStep[] = [
    { id: "data", title: "Datos", content: <p>Completá los datos.</p> },
    { id: "code", title: "Código", content: <p>Enviá el código.</p>, action: written ? undefined : { label: "Enviar código", onRun: onWrite }, secondary: <button type="button" onClick={onRecover}>Consultar envío</button>, secondaryLabel: "Recuperar el envío" },
    { id: "review", title: "Revisión", content: <p>Revisá y enviá.</p> },
  ];
  return <AppUIProvider><GuidedSteps label="Flujo de prueba" steps={steps} current={current} onCurrentChange={setCurrent} finalAction={{ label: "Enviar solicitud", onRun: onFinish }} /></AppUIProvider>;
}

describe("guided steps", () => {
  it("should run a step's own write instead of advancing until the owner confirms it", () => {
    const onWrite = vi.fn(), onFinish = vi.fn(), onRecover = vi.fn();
    const view = render(<Flow written={false} onWrite={onWrite} onFinish={onFinish} onRecover={onRecover} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Enviá el código.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Enviá el código.")).toBeInTheDocument();
    view.rerender(<Flow written onWrite={onWrite} onFinish={onFinish} onRecover={onRecover} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("should keep secondary actions collapsed under their own disclosure", () => {
    const onRecover = vi.fn();
    render(<Flow written={false} onWrite={vi.fn()} onFinish={vi.fn()} onRecover={onRecover} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const disclosure = screen.getByText("Recuperar el envío").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Recuperar el envío"));
    fireEvent.click(screen.getByRole("button", { name: "Consultar envío" }));
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("should not run a blocked step write and should say why", () => {
    const onWrite = vi.fn();
    function Blocked() {
      const [current, setCurrent] = useState(0);
      return <AppUIProvider><GuidedSteps label="Flujo bloqueado" steps={[{ id: "one", title: "Uno", content: null, blockedReason: "Confirmá el envío.", action: { label: "Enviar código", onRun: onWrite } }, { id: "two", title: "Dos", content: null }]} current={current} onCurrentChange={setCurrent} finalAction={{ label: "Listo", onRun: vi.fn() }} /></AppUIProvider>;
    }
    render(<Blocked />);
    expect(screen.getByText("Confirmá el envío.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Flujo bloqueado" }));
    expect(onWrite).not.toHaveBeenCalled();
  });
});
