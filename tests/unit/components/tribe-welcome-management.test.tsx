import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { TribeWelcomeManagement } from "@/components/tribes/tribe-welcome-management";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const fetchMock = jest.fn();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildWelcome() {
  return {
    linksHeading: "Recursos para empezar",
    links: [
      {
        badgeLabel: "Soporte",
        description: null,
        id: "11111111-1111-4111-8111-111111111111",
        isActive: true,
        label: "Soporte",
        message: null,
        phoneNumber: null,
        sortOrder: 1,
        type: TRIBE_WELCOME_LINK_TYPE.customButton,
        url: "https://soporte.example.com",
      },
    ],
    rules: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        isActive: true,
        label: "Presentate al entrar",
        sortOrder: 1,
      },
    ],
    selectionModalBenefit: null,
    selectionModalDescription:
      "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
    selectionModalTitle: "Elegí cómo querés empezar",
    welcomeMessage: "Nos alegra que te sumes. Antes de activar tu acceso, leé los acuerdos y elegí cómo querés empezar.",
  };
}

describe("TribeWelcomeManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: jest.fn(async () => ({ message: "Bienvenida actualizada." })),
      ok: true,
    });
  });

  it("renders welcome content as read-only for non-leaders", () => {
    render(
      <TribeWelcomeManagement
        canEdit={false}
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.getByRole("heading", { name: "Bienvenido/a" })).toBeInTheDocument();
    expect(screen.getByText("Presentate al entrar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });

  it("renders read-only resource links as plain anchors when selections cannot be recorded", () => {
    render(
      <TribeWelcomeManagement
        canEdit={false}
        canRecordSelections={false}
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.getByRole("link", { name: /Soporte/ })).toHaveAttribute(
      "href",
      "https://soporte.example.com"
    );
    expect(screen.queryByRole("button", { name: /Soporte/ })).not.toBeInTheDocument();
  });

  it("renders read-only resource links as recording buttons when selections can be recorded", () => {
    render(
      <TribeWelcomeManagement
        canEdit={false}
        canRecordSelections
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.getByRole("button", { name: /Soporte/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Soporte/ })).not.toBeInTheDocument();
  });

  it("saves leader edits with visible feedback", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    await user.clear(screen.getByLabelText("Mensaje de bienvenida"));
    await user.type(
      screen.getByLabelText("Mensaje de bienvenida"),
      "Bienvenido/a a Matematica Pro"
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/welcome",
        expect.objectContaining({
          method: "PUT",
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith("Bienvenida actualizada.");
  });

  it("offers only custom and WhatsApp link types", () => {
    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.getByRole("option", { name: "Link personalizado" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "WhatsApp" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Red social" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Soporte" })).not.toBeInTheDocument();
  });

  it("does not render a screen mode selector", () => {
    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.queryByText("Tipo de pantalla")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pantalla simple")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pantalla completa")).not.toBeInTheDocument();
  });

  it("creates valid UUIDs when randomUUID is unavailable", async () => {
    const originalCrypto = globalThis.crypto;
    const user = userEvent.setup();

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (values: Uint8Array) => {
          values.fill(1);

          return values;
        },
      },
    });

    try {
      render(
        <TribeWelcomeManagement
          canEdit
          tribeSlug="matematica-pro"
          welcome={buildWelcome()}
        />
      );

      await user.click(screen.getByRole("button", { name: "Agregar acuerdo" }));

      const ruleInputs = screen.getAllByLabelText("Acuerdo");

      await user.type(ruleInputs.at(-1) as HTMLElement, "Saludar al entrar");
      await user.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      const [, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit.body as string) as ReturnType<
        typeof buildWelcome
      >;
      const createdRule = body.rules.at(-1);

      expect(createdRule?.id).toMatch(UUID_PATTERN);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it(
    "uses the next available sort order after removing and adding items",
    async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "Soporte",
              id: "11111111-1111-4111-8111-111111111111",
              isActive: true,
              label: "Soporte",
              message: null,
              phoneNumber: null,
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.customButton,
              url: "https://soporte.example.com",
            },
            {
              badgeLabel: "Canal",
              id: "33333333-3333-4333-8333-333333333333",
              isActive: true,
              label: "Canal",
              message: null,
              phoneNumber: null,
              sortOrder: 2,
              type: TRIBE_WELCOME_LINK_TYPE.customButton,
              url: "https://canal.example.com",
            },
          ],
          rules: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              isActive: true,
              label: "Presentate al entrar",
              sortOrder: 1,
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              isActive: true,
              label: "Cuidá el tono",
              sortOrder: 2,
            },
          ],
        }}
      />
    );

    await user.click(screen.getAllByRole("button", { name: "Eliminar" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Eliminar" })[1]);
    await user.click(screen.getByRole("button", { name: "Agregar acuerdo" }));
    await user.click(screen.getByRole("button", { name: "Agregar link" }));

    await user.type(
      screen.getAllByLabelText("Acuerdo").at(-1) as HTMLElement,
      "Saludar al entrar"
    );
    await user.type(
      screen.getAllByLabelText("Título del recurso").at(-1) as HTMLElement,
      "Nuevo recurso"
    );
    await user.type(
      screen.getAllByLabelText("URL de destino").at(-1) as HTMLElement,
      "https://nuevo.example.com"
    );
    await user.type(
      screen.getAllByLabelText("Etiqueta para miembros").at(-1) as HTMLElement,
      "Nuevo badge"
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string) as ReturnType<
      typeof buildWelcome
    >;

    expect(body.rules.map((rule) => rule.sortOrder)).toEqual([2, 3]);
    expect(body.links.map((link) => link.sortOrder)).toEqual([2, 3]);
    },
    15000
  );

  it("blocks WhatsApp buttons without a phone number before saving", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "Badge WA",
              id: "link-1",
              isActive: true,
              label: "WhatsApp",
              message: "Hola",
              phoneNumber: "",
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
              url: null,
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Completá el teléfono de WhatsApp para guardar ese link.")
    ).toBeInTheDocument();
  });

  it("shows a default badge when the welcome message equals the platform default", () => {
    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.getAllByText("Predeterminado")).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: "Restaurar predeterminado" })
    ).not.toBeInTheDocument();
  });

  it("offers a restore action and reverts to the default message when used", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    const welcomeInput = screen.getByLabelText("Mensaje de bienvenida");

    await user.clear(welcomeInput);
    await user.type(welcomeInput, "Mensaje personalizado");

    expect(screen.getAllByText("Predeterminado")).toHaveLength(3);

    await user.click(
      screen.getByRole("button", { name: "Restaurar predeterminado" })
    );

    expect(welcomeInput).toHaveValue("Nos alegra que te sumes. Antes de activar tu acceso, leé los acuerdos y elegí cómo querés empezar.");
    expect(screen.getAllByText("Predeterminado")).toHaveLength(4);
  });

  it("renders an empty state when there are no rules or links", () => {
    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          linksHeading: "Recursos para empezar",
          links: [],
          rules: [],
          selectionModalBenefit: null,
          selectionModalDescription:
            "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
          selectionModalTitle: "Elegí cómo querés empezar",
          welcomeMessage: "Mensaje personalizado",
        }}
      />
    );

    expect(screen.getByText("Aún no agregaste acuerdos.")).toBeInTheDocument();
    expect(screen.getByText("Aún no agregaste links.")).toBeInTheDocument();
  });

  it("shows a URL helper and flags invalid URLs on blur", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "Soporte",
              id: "link-1",
              isActive: true,
              label: "Soporte",
              message: null,
              phoneNumber: null,
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.customButton,
              url: "",
            },
          ],
        }}
      />
    );

    expect(
      screen.getByText(
        "A dónde lleva el recurso al elegirlo. Pegá un enlace completo, incluido https://"
      )
    ).toBeInTheDocument();

    const urlInput = screen.getByLabelText("URL de destino");

    await user.type(urlInput, "not-a-url");
    await user.tab();

    expect(
      await screen.findByText(
        "Ingresá una URL válida que empiece con http:// o https://"
      )
    ).toBeInTheDocument();
  });

  it("renders a live preview that mirrors the form state", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    const preview = screen.getByRole("complementary", {
      name: "Vista previa de la bienvenida",
    });

    expect(preview).toBeInTheDocument();
    expect(preview).toHaveTextContent("Nos alegra que te sumes. Antes de activar tu acceso, leé los acuerdos y elegí cómo querés empezar.");
    expect(preview).toHaveTextContent("Presentate al entrar");

    const welcomeInput = screen.getByLabelText("Mensaje de bienvenida");

    await user.clear(welcomeInput);
    await user.type(welcomeInput, "Hola tribu");

    expect(preview).toHaveTextContent("Hola tribu");
  });

  it("opens a preview of the member selection modal without triggering network or navigation", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    const openModalButton = screen.getByRole("button", {
      name: "Ver modal de selección",
    });

    await user.click(openModalButton);

    const dialog = await screen.findByRole("dialog", {
      name: "Elegí cómo querés empezar",
    });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Soporte");

    const optionButton = screen.getByRole("button", { name: /Soporte/ });

    await user.click(optionButton);

    expect(fetchMock).not.toHaveBeenCalled();

    const closeButton = screen.getByRole("button", { name: "Cerrar" });

    await user.click(closeButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Elegí cómo querés empezar",
        })
      ).not.toBeInTheDocument();
    });
  });

  it("disables the modal preview button when no link is active", async () => {
    const welcome = buildWelcome();
    welcome.links[0].isActive = false;

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={welcome}
      />
    );

    const openModalButton = screen.getByRole("button", {
      name: "Ver modal de selección",
    });

    expect(openModalButton).toBeDisabled();
  });

  it("blocks saving and shows an inline error when a custom URL is empty", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "Soporte",
              id: "link-1",
              isActive: true,
              label: "Soporte",
              message: null,
              phoneNumber: null,
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.customButton,
              url: "",
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ingresá una URL.")).toBeInTheDocument();
  });

  it("blocks saving and shows an inline error when a rule label is empty", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          rules: [
            {
              id: "rule-1",
              isActive: true,
              label: "",
              sortOrder: 1,
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Escribí el acuerdo antes de guardar.")
    ).toBeInTheDocument();
  });

  it("blocks saving and shows an inline error when a link badge label is empty", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "",
              id: "link-1",
              isActive: true,
              label: "Soporte",
              message: null,
              phoneNumber: null,
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.customButton,
              url: "https://soporte.example.com",
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Ingresá un texto para el badge.")
    ).toBeInTheDocument();
  });

  it("blocks saving and shows inline errors when required modal copy is empty", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    await user.clear(screen.getByLabelText(/Título del modal/));
    await user.clear(screen.getByLabelText(/Descripción del modal/));
    await user.clear(screen.getByLabelText(/Encabezado de recursos/));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Ingresá un título para el modal.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ingresá una descripción para el modal.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ingresá un encabezado para los recursos.")
    ).toBeInTheDocument();
  });

  it("rejects WhatsApp phones with an invalid international format", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "Badge WA",
              id: "link-1",
              isActive: true,
              label: "WhatsApp",
              message: "Hola",
              phoneNumber: "12345",
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
              url: null,
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Ingresá un número válido en formato internacional (ej.: +54 9 11 1234 5678)."
      )
    ).toBeInTheDocument();
  });

  it("accepts valid WhatsApp phones in international format", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "Badge WA",
              id: "link-1",
              isActive: true,
              label: "WhatsApp",
              message: "Hola",
              phoneNumber: "+54 9 11 1234 5678",
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
              url: null,
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("sanitizes the WhatsApp custom message before submitting it", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "Badge WA",
              id: "link-1",
              isActive: true,
              label: "WhatsApp",
              message:
                "  Hola​   tribu\r\n\n\n\n\nVengo de la web  ",
              phoneNumber: "+54 9 11 1234 5678",
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
              url: null,
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string) as ReturnType<
      typeof buildWelcome
    >;
    const submittedLink = body.links[0];

    expect(submittedLink?.message).toBe("Hola tribu\n\nVengo de la web");
  });

  it("blocks WhatsApp buttons without normalized phone digits before saving", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              badgeLabel: "Badge WA",
              id: "link-1",
              isActive: true,
              label: "WhatsApp",
              message: "Hola",
              phoneNumber: "sin digitos",
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
              url: null,
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Completá el teléfono de WhatsApp para guardar ese link.")
    ).toBeInTheDocument();
  });
});
