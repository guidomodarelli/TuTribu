/** Exercises capability-specific selection with real shared UI and own controlled props. @module messaging-resource-selection-tests */
import {randomUUID} from "node:crypto";
import {render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingConnectionResources} from "@/components/academy-admissions/messaging-connection-resources";

/** @returns An explicitly selected channel and owned resource options, never a provider response. */
function resourceFixture(){return{channel:"email" as const,availableChannels:["email","sms","whatsapp"]as const,senderId:"",templateId:"",templateLanguage:"",confirmed:false,busy:false,canSave:false,senders:{items:[{id:randomUUID(),label:"Remitente de ejemplo",channels:["email" as const],readiness:"ready" as const}],nextCursor:undefined},templates:{items:[],nextCursor:undefined},fieldErrors:{},message:null,onChannelChange:vi.fn(),onSenderChange:vi.fn(),onTemplateChange:vi.fn(),onTemplateLanguageChange:vi.fn(),onConfirmationChange:vi.fn(),onReadSenders:vi.fn(),onReadTemplates:vi.fn(),onMoreSenders:vi.fn(),onMoreTemplates:vi.fn(),onSave:vi.fn()};}

describe("connection resource selection",()=>{
  it("should offer only declared email capability without inventing phone choices",async()=>{
    const props={...resourceFixture(),availableChannels:["email"]as const},user=userEvent.setup();
    render(<MessagingConnectionResources {...props} />);
    await user.click(screen.getByRole("combobox",{name:"Canal que querés preparar"}));
    await waitFor(()=>expect(screen.getByRole("option",{name:/Correo/})).toBeVisible());
    expect(screen.queryByRole("option",{name:"SMS"})).not.toBeInTheDocument();
    expect(screen.queryByRole("option",{name:"WhatsApp"})).not.toBeInTheDocument();
    expect(props.onReadSenders).not.toHaveBeenCalled();expect(props.onSave).not.toHaveBeenCalled();
  });
  it("should hide unsupported template fields and block an unsupported channel even if caller readiness is true",()=>{
    const props={...resourceFixture(),availableChannels:["email"]as const,channel:"whatsapp"as const,confirmed:true,canSave:true};
    const view=render(<MessagingConnectionResources {...props} />);
    expect(screen.queryByLabelText("Identificador de plantilla")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Idioma de la plantilla")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Guardar configuración del canal"})).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/canales disponibles/);
    view.rerender(<MessagingConnectionResources {...props} channel="email" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();expect(props.onSave).not.toHaveBeenCalled();
  });
  it("should require an explicit sender selection and omit WhatsApp-only fields from email",async()=>{
    const props=resourceFixture(),user=userEvent.setup();render(<MessagingConnectionResources {...props} />);
    expect(screen.getByRole("combobox",{name:"Remitente del canal"})).toBeVisible();expect(screen.queryByLabelText("Plantilla de autenticación")).not.toBeInTheDocument();expect(props.onSenderChange).not.toHaveBeenCalled();expect(props.onReadSenders).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Guardar configuración del canal"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"Consultar remitentes"}));expect(props.onReadSenders).toHaveBeenCalledTimes(1);expect(props.onSave).not.toHaveBeenCalled();
  });
  it("should show template and language only for WhatsApp while retaining a validated manual-reference path",()=>{
    const props=resourceFixture();render(<MessagingConnectionResources {...props} channel="whatsapp" />);
    expect(screen.getByLabelText("Identificador del remitente")).toBeVisible();expect(screen.getByLabelText("Identificador de plantilla")).toBeVisible();expect(screen.getByLabelText("Idioma de la plantilla")).toBeVisible();expect(screen.getByText(/El guardado comprueba el recurso/i)).toBeVisible();expect(props.onSave).not.toHaveBeenCalled();
  });
  it("should retain validation feedback and require explicit consent before configuration without sending a diagnostic",()=>{
    const props=resourceFixture();render(<MessagingConnectionResources {...props} fieldErrors={{senderId:"Elegí un remitente o ingresá su identificador."}} message={{kind:"alert",text:"La lista no se pudo completar. Reintentá la consulta."}} busy />);
    expect(screen.getByText("La lista no se pudo completar. Reintentá la consulta.")).toHaveAttribute("role","alert");expect(screen.getByText("Elegí un remitente o ingresá su identificador.")).toBeVisible();expect(screen.getByRole("button",{name:"Guardar configuración del canal"})).toBeDisabled();expect(props.onSave).not.toHaveBeenCalled();
  });
});
