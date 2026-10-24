/** Exercises the collapsed recovery of preserved tests with real shared UI. @module messaging-diagnostic-history-tests */
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingDiagnosticHistory} from "@/components/academy-admissions/messaging-diagnostic-history";
import {MESSAGING_CONNECTION_HISTORY_LIMIT} from "@/src/modules/messaging/constants/messaging-connections-browser";

const reference={operationId:"00000000-0000-4000-8000-000000000001",connectionId:"00000000-0000-4000-8000-000000000002",configurationVersion:2,channel:"email" as const};

describe("preserved tests recovery",()=>{
  it("should stay collapsed and hidden from the main path until the leader expands it",async()=>{
    const onRead=vi.fn(),user=userEvent.setup();render(<MessagingDiagnosticHistory references={[reference]} busy={false} onRead={onRead} />);
    expect(screen.getByRole("heading",{name:"Pruebas conservadas (1)"})).toBeVisible();expect(screen.queryByRole("button",{name:"Consultar prueba 1: Correo"})).not.toBeInTheDocument();
    await user.click(screen.getByText("Pruebas conservadas (1)"));
    await user.click(await screen.findByRole("button",{name:"Consultar prueba 1: Correo"}));expect(onRead).toHaveBeenCalledWith(reference);
  });
  it("should keep the full-history block visible outside the collapsed list",()=>{
    render(<MessagingDiagnosticHistory references={Array.from({length:MESSAGING_CONNECTION_HISTORY_LIMIT},(_,index)=>({...reference,operationId:`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`}))} busy={false} onRead={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(`Se alcanzó el límite de ${MESSAGING_CONNECTION_HISTORY_LIMIT} referencias`);expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
  it("should render nothing without preserved tests",()=>{
    const view=render(<MessagingDiagnosticHistory references={[]} busy={false} onRead={vi.fn()} />);expect(view.container).toBeEmptyDOMElement();
  });
});
