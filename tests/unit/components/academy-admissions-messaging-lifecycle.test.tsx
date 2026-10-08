/** Exercises local lifecycle controls with real shared UI and controlled own props. @module academy-admissions-messaging-lifecycle-tests */
import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessagingConnectionLifecycle, type MessagingConnectionLifecycleProps } from "@/components/academy-admissions/messaging-connection-lifecycle";

/** @returns Current safe view facts and callbacks, without auth/transport/platform mocks. */
function lifecycleProps():MessagingConnectionLifecycleProps{
  const id=randomUUID();return{connections:[{id,name:"Conexión preparada",version:4,state:"active",selected:true,candidate:false}],targetId:id,retiring:false,reason:"security_stop",confirmed:false,busy:false,canAct:true,onTarget:vi.fn(),onRetiring:vi.fn(),onReason:vi.fn(),onConfirm:vi.fn(),onAct:vi.fn(),onReauthenticate:vi.fn()};
}
describe("local connection lifecycle presenter",()=>{
  it("should require explicit controlled confirmation and describe safety limits without provider cancellation claims",async()=>{
    const props=lifecycleProps(),user=userEvent.setup(),view=render(<MessagingConnectionLifecycle {...props} />);expect(screen.getByRole("button",{name:"Suspender conexión"})).toBeDisabled();expect(screen.getByText(/pueden continuar y conservan su consumo/)).toBeVisible();
    await user.click(screen.getByRole("checkbox",{name:/Revisé la conexión/}));expect(props.onConfirm).toHaveBeenCalledWith(true);expect(props.onAct).not.toHaveBeenCalled();view.rerender(<MessagingConnectionLifecycle {...props} confirmed />);await user.click(screen.getByRole("button",{name:"Suspender conexión"}));expect(props.onAct).toHaveBeenCalledTimes(1);
  });
  it("should explain pending evidence recheck for compromise and keep Google preparation separate from the action",async()=>{
    const props=lifecycleProps(),user=userEvent.setup();render(<MessagingConnectionLifecycle {...props} reason="suspected_compromise" />);expect(screen.getByText(/pruebas afectadas de solicitudes pendientes requieren recomprobación/)).toBeVisible();expect(screen.getByText(/Los miembros admitidos y las invitaciones permanecen/)).toBeVisible();await user.click(screen.getByRole("button",{name:"Confirmar acción local con Google"}));expect(props.onReauthenticate).toHaveBeenCalledTimes(1);expect(props.onAct).not.toHaveBeenCalled();
  });
  it("should show ordinary retirement dependencies and block actions during pending work",()=>{
    const props=lifecycleProps();render(<MessagingConnectionLifecycle {...props} retiring busy confirmed />);expect(screen.getByRole("button",{name:"Desconectar conexión"})).toBeDisabled();expect(screen.queryByRole("combobox",{name:"Motivo de suspensión"})).not.toBeInTheDocument();expect(screen.getByText(/resolvé la verificación requerida o pausá admisiones/)).toBeVisible();expect(screen.getByRole("button",{name:"Confirmar acción local con Google"})).toBeDisabled();
  });
  it("should render a safe empty state without inventing a resource or a mutation",()=>{
    const props=lifecycleProps();render(<MessagingConnectionLifecycle {...props} connections={[]} targetId="" />);expect(screen.getByText("No hay conexiones vigentes para gestionar.")).toBeVisible();expect(screen.queryByRole("button",{name:"Suspender conexión"})).not.toBeInTheDocument();expect(props.onAct).not.toHaveBeenCalled();
  });
});
