"use client";

import { useId, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { LoaderCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { isValidPhoneNumber } from "libphonenumber-js";
import { AnimatePresence } from "motion/react";
import { toast, Button, Input, Switch, Textarea, AnimatedCount, AnimatedListItem } from "@golfo/ui";

import { TribeWelcomeDisplay } from "@/components/tribes/tribe-welcome-display";
import { TribeWelcomeSelectionModal } from "@/components/tribes/tribe-welcome-selection-modal";
import { readTribeSaveResponseMessage } from "@/lib/tribes/tribe-save-response";
import type {
  TribeWelcomeLinkResult,
  TribeWelcomeResult,
  TribeWelcomeRuleResult,
} from "@/src/modules/tribes/application/results/tribe-welcome-result";
import {
  DEFAULT_TRIBE_WELCOME_LINKS_HEADING,
  DEFAULT_TRIBE_WELCOME_MESSAGE,
  DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_DESCRIPTION,
  DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_TITLE,
  TRIBE_WELCOME_LINK_TYPE,
} from "@/src/modules/tribes/constants/tribe-welcome";
import styles from "./styles.module.scss";

const BADGE_LABEL_COUNTER_SEPARATOR = "/";

const TRIBE_WELCOME_MANAGEMENT_COPY = {
  activeLabel: "Activo",
  inactiveLabel: "Inactivo",
  addLinkButton: "Agregar link",
  addRuleButton: "Agregar acuerdo",
  badgeLabelCharCount: "caracteres",
  badgeLabelHelper: (current: number, max: number) =>
    `${current}${BADGE_LABEL_COUNTER_SEPARATOR}${max}`,
  badgeLabelHint:
    "Aparece como chip junto a cada miembro que eligió este recurso, en la sección Miembros de la tribu. Usá un texto breve y claro.",
  badgeLabelLabel: "Etiqueta para miembros",
  badgeLabelPlaceholder: "Ej.: Cambiar asesor",
  linkDescriptionLabel: "Descripción del recurso",
  linkDescriptionHint:
    "Texto opcional que aparece debajo del título del recurso, tanto en la pantalla de bienvenida como en el modal de selección.",
  linkDescriptionPlaceholder: "Ej.: Para cambiar tu asesor en IOL",
  defaultBadge: "Predeterminado",
  editDescriptionPrimary:
    "Definí la pantalla que ven las personas antes de entrar.",
  editDescriptionSecondary:
    "Esta referencia también queda disponible dentro de la tribu.",
  editTitle: "Bienvenida",
  emptyLinks: "Aún no agregaste links.",
  emptyRules: "Aún no agregaste acuerdos.",
  fallbackSaveError: "No pudimos guardar la bienvenida.",
  legendOf: "de",
  linkLabel: "Título del recurso",
  linkLabelHint:
    "Texto principal del botón. Es lo que ven los miembros en la pantalla de bienvenida y en el modal de selección.",
  linkLabelPlaceholder: "Ej.: Unirse al canal",
  linkLegendPrefix: "Recurso",
  linkMessageLabel: "Mensaje precargado de WhatsApp",
  linkMessageHint:
    "Texto que se carga automáticamente en el chat de WhatsApp cuando un miembro toca el botón del recurso.",
  linkMessagePlaceholder: "Ej.: Hola, vengo",
  linkPhoneLabel: "Número de WhatsApp",
  linkPhoneHint:
    "Número en formato internacional al que se abre el chat cuando un miembro elige el recurso.",
  linkPhonePlaceholder: "+54 9 11 1234 5678",
  linkTypeLabel: "Tipo de recurso",
  linkTypeHint:
    "Define cómo se abre el recurso cuando un miembro lo elige: con un enlace propio o iniciando una conversación de WhatsApp.",
  linkUrlHelper:
    "A dónde lleva el recurso al elegirlo. Pegá un enlace completo, incluido https://",
  linkUrlInvalid: "Ingresá una URL válida que empiece con http:// o https://",
  linkUrlLabel: "URL de destino",
  linkUrlPlaceholder: "https://...",
  previewEyebrow: "Vista previa",
  previewModalButton: "Ver modal de selección",
  previewModalEmpty: "Activá al menos un link para previsualizar el modal.",
  previewSrLabel: "Vista previa de la bienvenida",
  removeItemLabel: (legend: string) => `Eliminar ${legend}`,
  removeLinkTitle: "Eliminar link",
  removeRuleTitle: "Eliminar acuerdo",
  requiredBadgeLabel: "Ingresá un texto para el badge.",
  requiredHelper: "Obligatorio",
  resetDefaultLabel: "Restaurar predeterminado",
  resourcesHeading: "Recursos y links",
  ruleLabel: "Acuerdo",
  ruleHint:
    "Cada acuerdo se muestra como un punto numerado en la pantalla de bienvenida, bajo 'Acuerdos de convivencia'.",
  ruleLegendPrefix: "Acuerdo",
  rulePlaceholder: "Ej.: Respetar el descanso",
  rulesHeading: "Acuerdos de convivencia",
  requiredLinkLabel: "Ingresá un texto para el link.",
  requiredLinkUrl: "Ingresá una URL.",
  requiredRuleLabel: "Escribí el acuerdo antes de guardar.",
  saveButton: "Guardar",
  savingButton: "Guardando...",
  saveSuccess: "Bienvenida actualizada.",
  validationSummary: "Revisá los campos marcados antes de guardar.",
  validationWhatsappPhone:
    "Completá el teléfono de WhatsApp para guardar ese link.",
  validationWhatsappPhoneInvalid:
    "Ingresá un número válido en formato internacional (ej.: +54 9 11 1234 5678).",
  welcomeMessageLabel: "Mensaje de bienvenida",
  welcomeMessagePlaceholder: "Ej.: Bienvenido/a a la tribu",
  selectionModalTitleLabel: "Título del modal",
  selectionModalTitlePlaceholder: "Ej.: Elegí una opción para empezar",
  selectionModalDescriptionLabel: "Descripción del modal",
  selectionModalDescriptionPlaceholder:
    "Ej.: Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo.",
  selectionModalBenefitLabel: "Beneficio por seleccionar una opción",
  selectionModalBenefitPlaceholder:
    "Ej.: Te entregamos una guía bonus cuando elegís una opción. La entrega es externa, la coordina el líder o el equipo.",
  selectionModalBenefitHint:
    "Se muestra como bloque destacado dentro del modal de selección y también en la pantalla de bienvenida, encima de la lista de recursos. La entrega la coordina el líder o el equipo. Dejalo vacío si no querés ofrecer ninguno.",
  welcomeMessageHint:
    "Aparece en la pantalla de bienvenida que ven los miembros al entrar a la tribu, debajo del saludo. Es lo primero que leen al ingresar.",
  selectionModalTitleHint:
    "Encabezado del pop-up que se abre la primera vez que un miembro entra y todavía no eligió ninguna opción.",
  selectionModalDescriptionHint:
    "Acompaña al título del modal y aclara qué pasa al elegir una opción.",
  linksHeadingHint:
    "Título que aparece sobre la lista de recursos en la pantalla de bienvenida.",
  linksHeadingLabel: "Encabezado de recursos",
  linksHeadingPlaceholder: "Ej.: Recursos para empezar",
  requiredSelectionModalTitle: "Ingresá un título para el modal.",
  requiredSelectionModalDescription:
    "Ingresá una descripción para el modal.",
  requiredLinksHeading: "Ingresá un encabezado para los recursos.",
} as const;

const WELCOME_MANAGEMENT_ROUTE = {
  apiPrefix: "/api/tribes/",
  welcomeSegment: "/welcome",
} as const;

const WELCOME_MANAGEMENT_REQUEST = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  dangerVariant: "danger",
  iconButtonSize: "sm",
  jsonContentType: "application/json",
  secondaryVariant: "secondary",
  putMethod: "PUT",
  submitButtonType: "submit",
} as const;

const WELCOME_MANAGEMENT_TEXT = {
  legendSeparator: " ",
} as const;

const WELCOME_MANAGEMENT_ARIA = {
  ariaHiddenTrue: "true",
  roleAlert: "alert",
} as const;

const BADGE_LABEL_MAX_LENGTH = 30;

const WELCOME_LINK_PATCH_KEY = {
  badgeLabel: "badgeLabel",
  description: "description",
  label: "label",
  phoneNumber: "phoneNumber",
  url: "url",
} as const;

const WELCOME_RULE_PATCH_KEY = {
  label: "label",
} as const;

const WELCOME_URL_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;

const PHONE_NUMBER_NON_DIGIT_PATTERN = /\D/g;
const WHATSAPP_MESSAGE_MAX_LENGTH = 1000;
const WHATSAPP_MESSAGE_CONTROL_CHARS_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g;
const WHATSAPP_MESSAGE_CRLF_PATTERN = /\r\n?/g;
const WHATSAPP_MESSAGE_MULTI_NEWLINE_PATTERN = /\n{3,}/g;
const WHATSAPP_MESSAGE_MULTI_SPACE_PATTERN = / {2,}/g;
const WHATSAPP_MESSAGE_LINE_FEED = "\n";
const WHATSAPP_MESSAGE_DOUBLE_LINE_FEED = "\n\n";
const WHATSAPP_MESSAGE_SINGLE_SPACE = " ";
const EMPTY_STRING = "";
const UUID_BYTE_LENGTH = 16;
const UUID_FIRST_GROUP_END_INDEX = 4;
const UUID_FOURTH_GROUP_END_INDEX = 10;
const UUID_SECOND_GROUP_END_INDEX = 6;
const UUID_THIRD_GROUP_END_INDEX = 8;
const UUID_GROUP_SLICES = [
  [0, UUID_FIRST_GROUP_END_INDEX],
  [UUID_FIRST_GROUP_END_INDEX, UUID_SECOND_GROUP_END_INDEX],
  [UUID_SECOND_GROUP_END_INDEX, UUID_THIRD_GROUP_END_INDEX],
  [UUID_THIRD_GROUP_END_INDEX, UUID_FOURTH_GROUP_END_INDEX],
  [UUID_FOURTH_GROUP_END_INDEX, UUID_BYTE_LENGTH],
] as const;
const UUID_GROUP_SEPARATOR = "-";
const UUID_HEX_BYTE_LENGTH = 2;
const UUID_HEX_PAD_CHARACTER = "0";
const UUID_HEX_RADIX = 16;
const UUID_RANDOM_BYTE_RANGE = 256;
const UUID_VARIANT_BIT_MASK = 0x3f;
const UUID_VARIANT_BYTE_INDEX = 8;
const UUID_VARIANT_VALUE = 0x80;
const UUID_VERSION_BIT_MASK = 0x0f;
const UUID_VERSION_BYTE_INDEX = 6;
const UUID_VERSION_VALUE = 0x40;

const WELCOME_LINK_TYPE_LABEL = {
  [TRIBE_WELCOME_LINK_TYPE.customButton]: "Link personalizado",
  [TRIBE_WELCOME_LINK_TYPE.whatsappButton]: "WhatsApp",
} as const;

type TribeWelcomeManagementProps = {
  canEdit: boolean;
  canRecordSelections?: boolean;
  tribeSlug: string;
  welcome: TribeWelcomeResult;
};

function createClientId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const uuidBytes = new Uint8Array(UUID_BYTE_LENGTH);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(uuidBytes);
  } else {
    for (let byteIndex = 0; byteIndex < uuidBytes.length; byteIndex += 1) {
      uuidBytes[byteIndex] = Math.floor(
        Math.random() * UUID_RANDOM_BYTE_RANGE
      );
    }
  }

  uuidBytes[UUID_VERSION_BYTE_INDEX] =
    (uuidBytes[UUID_VERSION_BYTE_INDEX] & UUID_VERSION_BIT_MASK) |
    UUID_VERSION_VALUE;
  uuidBytes[UUID_VARIANT_BYTE_INDEX] =
    (uuidBytes[UUID_VARIANT_BYTE_INDEX] & UUID_VARIANT_BIT_MASK) |
    UUID_VARIANT_VALUE;

  const hexBytes = Array.from(uuidBytes, (byte) =>
    byte
      .toString(UUID_HEX_RADIX)
      .padStart(UUID_HEX_BYTE_LENGTH, UUID_HEX_PAD_CHARACTER)
  );

  return UUID_GROUP_SLICES.map(([startIndex, endIndex]) =>
    hexBytes.slice(startIndex, endIndex).join("")
  ).join(UUID_GROUP_SEPARATOR);
}

function buildWelcomeEndpoint(tribeSlug: string): string {
  return (
    WELCOME_MANAGEMENT_ROUTE.apiPrefix +
    tribeSlug +
    WELCOME_MANAGEMENT_ROUTE.welcomeSegment
  );
}

function createEmptyRule(
  id: string,
  sortOrder: number
): TribeWelcomeRuleResult {
  return {
    id,
    isActive: true,
    label: "",
    sortOrder,
  };
}

function createEmptyLink(
  id: string,
  sortOrder: number
): TribeWelcomeLinkResult {
  return {
    badgeLabel: "",
    description: null,
    id,
    isActive: true,
    label: "",
    message: null,
    phoneNumber: null,
    sortOrder,
    type: TRIBE_WELCOME_LINK_TYPE.customButton,
    url: "",
  };
}

function getNextSortOrder(
  items: Array<Pick<TribeWelcomeRuleResult, "sortOrder">>
): number {
  return (
    Math.max(
      0,
      ...items.map((item) => item.sortOrder)
    ) + 1
  );
}

function buildLegend(prefix: string, index: number, total: number): string {
  const separator = WELCOME_MANAGEMENT_TEXT.legendSeparator;

  return (
    prefix +
    separator +
    String(index + 1) +
    separator +
    TRIBE_WELCOME_MANAGEMENT_COPY.legendOf +
    separator +
    String(total)
  );
}

function isWhatsappLinkPhoneEmpty(link: TribeWelcomeLinkResult): boolean {
  if (link.type !== TRIBE_WELCOME_LINK_TYPE.whatsappButton) {
    return false;
  }

  return !link.phoneNumber?.replace(PHONE_NUMBER_NON_DIGIT_PATTERN, "");
}

function isWhatsappLinkPhoneInvalidFormat(
  link: TribeWelcomeLinkResult
): boolean {
  if (link.type !== TRIBE_WELCOME_LINK_TYPE.whatsappButton) {
    return false;
  }

  const phone = link.phoneNumber?.trim();

  if (!phone) {
    return false;
  }

  return !isValidPhoneNumber(phone);
}

function isWhatsappLinkPhoneInvalid(link: TribeWelcomeLinkResult): boolean {
  return (
    isWhatsappLinkPhoneEmpty(link) || isWhatsappLinkPhoneInvalidFormat(link)
  );
}

function sanitizeWhatsappMessage(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const sanitized = value
    .replace(WHATSAPP_MESSAGE_CRLF_PATTERN, WHATSAPP_MESSAGE_LINE_FEED)
    .replace(WHATSAPP_MESSAGE_CONTROL_CHARS_PATTERN, EMPTY_STRING)
    .replace(
      WHATSAPP_MESSAGE_MULTI_NEWLINE_PATTERN,
      WHATSAPP_MESSAGE_DOUBLE_LINE_FEED
    )
    .replace(WHATSAPP_MESSAGE_MULTI_SPACE_PATTERN, WHATSAPP_MESSAGE_SINGLE_SPACE)
    .trim()
    .slice(0, WHATSAPP_MESSAGE_MAX_LENGTH);

  return sanitized.length > 0 ? sanitized : null;
}

function sanitizeWelcomeForSave(welcome: TribeWelcomeResult): TribeWelcomeResult {
  return {
    ...welcome,
    links: welcome.links.map((link) =>
      link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton
        ? { ...link, message: sanitizeWhatsappMessage(link.message) }
        : link
    ),
  };
}

function isUrlWellFormed(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  try {
    const parsed = new URL(value);

    return (
      parsed.protocol === WELCOME_URL_PROTOCOL.http ||
      parsed.protocol === WELCOME_URL_PROTOCOL.https
    );
  } catch {
    return false;
  }
}

function isCustomLinkUrlValidForSave(link: TribeWelcomeLinkResult): boolean {
  if (link.type !== TRIBE_WELCOME_LINK_TYPE.customButton) {
    return true;
  }

  const trimmedUrl = (link.url ?? "").trim();

  return trimmedUrl.length > 0 && isUrlWellFormed(trimmedUrl);
}

function collectInvalidUrlLinkIds(
  links: TribeWelcomeLinkResult[]
): Set<string> {
  return new Set(
    links
      .filter((link) => !isCustomLinkUrlValidForSave(link))
      .map((link) => link.id)
  );
}

function isRequiredTextMissing(value: string): boolean {
  return value.trim().length === 0;
}

function collectInvalidLabelRuleIds(
  rules: TribeWelcomeRuleResult[]
): Set<string> {
  return new Set(
    rules
      .filter((rule) => isRequiredTextMissing(rule.label))
      .map((rule) => rule.id)
  );
}

function collectInvalidLabelLinkIds(
  links: TribeWelcomeLinkResult[]
): Set<string> {
  return new Set(
    links
      .filter((link) => isRequiredTextMissing(link.label))
      .map((link) => link.id)
  );
}

function areRulesEqual(
  left: TribeWelcomeRuleResult[],
  right: TribeWelcomeRuleResult[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((ruleA, index) => {
    const ruleB = right[index];

    return (
      ruleA.id === ruleB.id &&
      ruleA.isActive === ruleB.isActive &&
      ruleA.label === ruleB.label &&
      ruleA.sortOrder === ruleB.sortOrder
    );
  });
}

function areLinksEqual(
  left: TribeWelcomeLinkResult[],
  right: TribeWelcomeLinkResult[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((linkA, index) => {
    const linkB = right[index];

    return (
      linkA.id === linkB.id &&
      linkA.isActive === linkB.isActive &&
      linkA.label === linkB.label &&
      linkA.badgeLabel === linkB.badgeLabel &&
      (linkA.description ?? null) === (linkB.description ?? null) &&
      (linkA.message ?? null) === (linkB.message ?? null) &&
      (linkA.phoneNumber ?? null) === (linkB.phoneNumber ?? null) &&
      linkA.sortOrder === linkB.sortOrder &&
      linkA.type === linkB.type &&
      (linkA.url ?? null) === (linkB.url ?? null)
    );
  });
}

function areWelcomesEqual(
  current: TribeWelcomeResult,
  saved: TribeWelcomeResult
): boolean {
  return (
    current.welcomeMessage === saved.welcomeMessage &&
    current.selectionModalTitle === saved.selectionModalTitle &&
    current.selectionModalDescription === saved.selectionModalDescription &&
    (current.selectionModalBenefit ?? null) ===
      (saved.selectionModalBenefit ?? null) &&
    current.linksHeading === saved.linksHeading &&
    areRulesEqual(current.rules, saved.rules) &&
    areLinksEqual(current.links, saved.links)
  );
}

async function submitWelcomeUpdate(
  tribeSlug: string,
  welcome: TribeWelcomeResult
): Promise<string> {
  const response = await fetch(buildWelcomeEndpoint(tribeSlug), {
    body: JSON.stringify(welcome),
    headers: {
      [WELCOME_MANAGEMENT_REQUEST.contentTypeHeader]:
        WELCOME_MANAGEMENT_REQUEST.jsonContentType,
    },
    method: WELCOME_MANAGEMENT_REQUEST.putMethod,
  });

  return readTribeSaveResponseMessage(response, TRIBE_WELCOME_MANAGEMENT_COPY);
}

type IdSet = ReadonlySet<string>;
type SetIdSet = Dispatch<SetStateAction<IdSet>>;
type FocusRefFactory = (
  id: string
) => (element: HTMLInputElement | HTMLTextAreaElement | null) => void;

// The required marker is drawn by CSS after the field label, so labels stay plain strings.
const REQUIRED_FIELD_CLASS_NAME =
  styles.TribeWelcomeManagement__field +
  " " +
  styles["TribeWelcomeManagement__field--required"];
const REQUIRED_FIELD_GROUP_CLASS_NAME =
  styles.TribeWelcomeManagement__fieldGroup +
  " " +
  styles["TribeWelcomeManagement__fieldGroup--required"];
const ROW_WITH_HEADER_CLASS_NAME =
  styles.TribeWelcomeManagement__row +
  " " +
  styles["TribeWelcomeManagement__row--withHeader"];

function getActiveStateLabel(isActive: boolean): string {
  return isActive
    ? TRIBE_WELCOME_MANAGEMENT_COPY.activeLabel
    : TRIBE_WELCOME_MANAGEMENT_COPY.inactiveLabel;
}

function hasPatchKey(patch: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

/** Error of a WhatsApp phone: missing or with an invalid format. */
function getPhoneErrorMessage(
  showPhoneError: boolean,
  link: TribeWelcomeLinkResult
): string | undefined {
  if (!showPhoneError) {
    return undefined;
  }

  return isWhatsappLinkPhoneEmpty(link)
    ? TRIBE_WELCOME_MANAGEMENT_COPY.validationWhatsappPhone
    : TRIBE_WELCOME_MANAGEMENT_COPY.validationWhatsappPhoneInvalid;
}

/** Error of a link URL: missing or malformed. */
function getUrlErrorMessage(
  showUrlError: boolean,
  link: TribeWelcomeLinkResult
): string | undefined {
  if (!showUrlError) {
    return undefined;
  }

  return isRequiredTextMissing(link.url ?? "")
    ? TRIBE_WELCOME_MANAGEMENT_COPY.requiredLinkUrl
    : TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlInvalid;
}

/** Returns a remover of one id from a set held in state, keeping the set when the id is absent. */
function clearIdFromSet(setter: SetIdSet) {
  return (id: string) => {
    setter((current) => {
      if (!current.has(id)) {
        return current;
      }

      const next = new Set(current);

      next.delete(id);

      return next;
    });
  };
}

/** Editable copy of the welcome and the selection modal. */
function useWelcomeTexts(welcome: TribeWelcomeResult) {
  const [welcomeMessage, setWelcomeMessage] = useState(welcome.welcomeMessage);
  const [selectionModalTitle, setSelectionModalTitle] = useState(
    welcome.selectionModalTitle
  );
  const [selectionModalDescription, setSelectionModalDescription] = useState(
    welcome.selectionModalDescription
  );
  const [selectionModalBenefit, setSelectionModalBenefit] = useState(
    welcome.selectionModalBenefit ?? ""
  );
  const [linksHeading, setLinksHeading] = useState(welcome.linksHeading);

  return { linksHeading, selectionModalBenefit, selectionModalDescription, selectionModalTitle, setLinksHeading, setSelectionModalBenefit, setSelectionModalDescription, setSelectionModalTitle, setWelcomeMessage, welcomeMessage };
}

type WelcomeTexts = ReturnType<typeof useWelcomeTexts>;

/** Validation summary and the rows whose fields failed the last check. */
function useWelcomeValidation() {
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [invalidUrlLinkIds, setInvalidUrlLinkIds] = useState<IdSet>(() => new Set());
  const [missingLabelRuleIds, setMissingLabelRuleIds] = useState<IdSet>(() => new Set());
  const [missingLabelLinkIds, setMissingLabelLinkIds] = useState<IdSet>(() => new Set());
  const [missingPhoneLinkIds, setMissingPhoneLinkIds] = useState<IdSet>(() => new Set());
  const [missingBadgeLabelLinkIds, setMissingBadgeLabelLinkIds] = useState<IdSet>(() => new Set());

  const markUrlValidity = (linkId: string, isValid: boolean) => {
    setInvalidUrlLinkIds((current) => {
      const next = new Set(current);

      if (isValid) {
        next.delete(linkId);
      } else {
        next.add(linkId);
      }

      return next;
    });
  };

  return { invalidUrlLinkIds, markUrlValidity, missingBadgeLabelLinkIds, missingLabelLinkIds, missingLabelRuleIds, missingPhoneLinkIds, setInvalidUrlLinkIds, setMissingBadgeLabelLinkIds, setMissingLabelLinkIds, setMissingLabelRuleIds, setMissingPhoneLinkIds, setValidationMessage, validationMessage };
}

type WelcomeValidation = ReturnType<typeof useWelcomeValidation>;

/** Rules and links of the welcome, with focus moved to added rows and away from removed ones. */
function useWelcomeCollections(welcome: TribeWelcomeResult) {
  const [rules, setRules] = useState(welcome.rules);
  const [links, setLinks] = useState(welcome.links);
  const pendingFocusIdRef = useRef<string | null>(null);
  const addRuleButtonRef = useRef<HTMLButtonElement | null>(null);
  const addLinkButtonRef = useRef<HTMLButtonElement | null>(null);

  return { addLinkButtonRef, addRuleButtonRef, links, pendingFocusIdRef, rules, setLinks, setRules };
}

type WelcomeCollections = ReturnType<typeof useWelcomeCollections>;

/** Saves the welcome once at a time and remembers the last saved version. */
function useWelcomeSaveState(welcome: TribeWelcomeResult) {
  const [isSaving, setIsSaving] = useState(false);
  const [savedWelcome, setSavedWelcome] = useState<TribeWelcomeResult>(welcome);
  const isSavingRef = useRef(false);

  return { isSaving, isSavingRef, savedWelcome, setIsSaving, setSavedWelcome };
}

type WelcomeSaveState = ReturnType<typeof useWelcomeSaveState>;

type CollectionHandlerOptions = {
  collections: WelcomeCollections;
  validation: WelcomeValidation;
};

/** Edits, adds and removes agreements. */
function createRuleHandlers({ collections, validation }: CollectionHandlerOptions) {
  const { addRuleButtonRef, pendingFocusIdRef, setRules } = collections;
  const clearMissingLabelRule = clearIdFromSet(validation.setMissingLabelRuleIds);
  const updateRule = (
    ruleId: string,
    patch: Partial<TribeWelcomeRuleResult>
  ) => {
    setRules((currentRules) =>
      currentRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...patch } : rule
      )
    );
    validation.setValidationMessage(null);

    if (hasPatchKey(patch, WELCOME_RULE_PATCH_KEY.label)) {
      clearMissingLabelRule(ruleId);
    }
  };
  // Ids are created outside the state updaters so the updaters stay pure (React
  // may call them twice) and the pending focus always targets the added row.
  const handleAddRule = () => {
    const createdRuleId = createClientId();

    pendingFocusIdRef.current = createdRuleId;
    setRules((currentRules) => [
      ...currentRules,
      createEmptyRule(createdRuleId, getNextSortOrder(currentRules)),
    ]);
  };
  // The removed row's controls leave the page, so focus moves to the add
  // button of the same collection instead of falling back to <body>.
  const handleRemoveRule = (ruleId: string) => {
    setRules((currentRules) =>
      currentRules.filter((currentRule) => currentRule.id !== ruleId)
    );
    addRuleButtonRef.current?.focus();
  };

  return { handleAddRule, handleRemoveRule, updateRule };
}

/** Edits, adds and removes resource links, clearing the errors an edit fixes. */
function createLinkHandlers({ collections, validation }: CollectionHandlerOptions) {
  const { addLinkButtonRef, pendingFocusIdRef, setLinks } = collections;
  const clearMissingLabelLink = clearIdFromSet(validation.setMissingLabelLinkIds);
  const clearMissingPhoneLink = clearIdFromSet(validation.setMissingPhoneLinkIds);
  const clearMissingBadgeLabelLink = clearIdFromSet(validation.setMissingBadgeLabelLinkIds);
  const updateLink = (
    linkId: string,
    patch: Partial<TribeWelcomeLinkResult>
  ) => {
    setLinks((currentLinks) =>
      currentLinks.map((link) =>
        link.id === linkId ? { ...link, ...patch } : link
      )
    );
    validation.setValidationMessage(null);

    if (hasPatchKey(patch, WELCOME_LINK_PATCH_KEY.url)) {
      validation.markUrlValidity(linkId, true);
    }
    if (hasPatchKey(patch, WELCOME_LINK_PATCH_KEY.label)) {
      clearMissingLabelLink(linkId);
    }
    if (hasPatchKey(patch, WELCOME_LINK_PATCH_KEY.phoneNumber)) {
      clearMissingPhoneLink(linkId);
    }
    if (hasPatchKey(patch, WELCOME_LINK_PATCH_KEY.badgeLabel)) {
      clearMissingBadgeLabelLink(linkId);
    }
  };
  const handleAddLink = () => {
    const createdLinkId = createClientId();

    pendingFocusIdRef.current = createdLinkId;
    setLinks((currentLinks) => [
      ...currentLinks,
      createEmptyLink(createdLinkId, getNextSortOrder(currentLinks)),
    ]);
  };
  const handleRemoveLink = (linkId: string) => {
    setLinks((currentLinks) =>
      currentLinks.filter((currentLink) => currentLink.id !== linkId)
    );
    addLinkButtonRef.current?.focus();
  };

  return { handleAddLink, handleRemoveLink, updateLink };
}

/** Focuses a newly added row's first field once it mounts. */
function createFocusRefFactory(
  pendingFocusIdRef: RefObject<string | null>
): FocusRefFactory {
  return (id) => (element) => {
    if (element && pendingFocusIdRef.current === id) {
      element.focus();
      pendingFocusIdRef.current = null;
    }
  };
}

/** Checks every row and required heading, marking the rows that failed. @returns Whether the welcome can be saved. */
function validateWelcomeForSave({
  collections,
  texts,
  validation,
}: {
  collections: WelcomeCollections;
  texts: WelcomeTexts;
  validation: WelcomeValidation;
}): boolean {
  const { links, rules } = collections;
  const nextInvalidUrls = collectInvalidUrlLinkIds(links);
  const nextMissingRuleLabels = collectInvalidLabelRuleIds(rules);
  const nextMissingLinkLabels = collectInvalidLabelLinkIds(links);
  const nextMissingPhones = new Set(
    links.filter(isWhatsappLinkPhoneInvalid).map((link) => link.id)
  );
  const nextMissingBadgeLabels = new Set(
    links
      .filter((link) => isRequiredTextMissing(link.badgeLabel))
      .map((link) => link.id)
  );

  validation.setInvalidUrlLinkIds(nextInvalidUrls);
  validation.setMissingLabelRuleIds(nextMissingRuleLabels);
  validation.setMissingLabelLinkIds(nextMissingLinkLabels);
  validation.setMissingPhoneLinkIds(nextMissingPhones);
  validation.setMissingBadgeLabelLinkIds(nextMissingBadgeLabels);

  const hasMissingHeadingFields =
    isRequiredTextMissing(texts.selectionModalTitle) ||
    isRequiredTextMissing(texts.selectionModalDescription) ||
    isRequiredTextMissing(texts.linksHeading);

  const hasClientSideErrors =
    nextInvalidUrls.size > 0 ||
    nextMissingRuleLabels.size > 0 ||
    nextMissingLinkLabels.size > 0 ||
    nextMissingPhones.size > 0 ||
    nextMissingBadgeLabels.size > 0 ||
    hasMissingHeadingFields;

  if (hasClientSideErrors) {
    validation.setValidationMessage(TRIBE_WELCOME_MANAGEMENT_COPY.validationSummary);
    return false;
  }

  return true;
}

type WelcomeSubmitOptions = {
  collections: WelcomeCollections;
  currentWelcome: TribeWelcomeResult;
  save: WelcomeSaveState;
  texts: WelcomeTexts;
  tribeSlug: string;
  validation: WelcomeValidation;
};

/** Validates and saves the welcome, one save at a time. */
function createWelcomeSubmitHandler({
  currentWelcome,
  save,
  tribeSlug,
  ...validationInput
}: WelcomeSubmitOptions) {
  return async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    // A second submit (double click, Enter held down) must not start another
    // request before the first one re-renders the disabled button.
    if (save.isSavingRef.current) {
      return;
    }

    if (!validateWelcomeForSave(validationInput)) {
      return;
    }

    save.isSavingRef.current = true;
    save.setIsSaving(true);
    validationInput.validation.setValidationMessage(null);

    try {
      const message = await submitWelcomeUpdate(
        tribeSlug,
        sanitizeWelcomeForSave(currentWelcome)
      );

      save.setSavedWelcome(currentWelcome);
      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : TRIBE_WELCOME_MANAGEMENT_COPY.fallbackSaveError
      );
    } finally {
      save.isSavingRef.current = false;
      save.setIsSaving(false);
    }
  };
}

/** Title, description and required-field hint of the editor. */
function WelcomeEditorHeader() {
  return (
    <header className={styles.TribeWelcomeManagement__header}>
      <h1 className={styles.TribeWelcomeManagement__title}>
        {TRIBE_WELCOME_MANAGEMENT_COPY.editTitle}
      </h1>
      <p className={styles.TribeWelcomeManagement__description}>
        {TRIBE_WELCOME_MANAGEMENT_COPY.editDescriptionPrimary}{" "}
        {TRIBE_WELCOME_MANAGEMENT_COPY.editDescriptionSecondary}
      </p>
      <p className={styles.TribeWelcomeManagement__requiredHint}>
        <span
          aria-hidden={WELCOME_MANAGEMENT_ARIA.ariaHiddenTrue}
          className={styles.TribeWelcomeManagement__requiredAsterisk}
        >
          *
        </span>
        {" "}
        {TRIBE_WELCOME_MANAGEMENT_COPY.requiredHelper}
      </p>
    </header>
  );
}

/** Default badge while a text keeps its default, otherwise the button that restores it. */
function DefaultValueHint({
  isDefault,
  onRestore,
}: {
  isDefault: boolean;
  onRestore: () => void;
}) {
  return (
    <span className={styles.TribeWelcomeManagement__defaultHint}>
      {isDefault ? (
        <span className={styles.TribeWelcomeManagement__defaultBadge}>
          {TRIBE_WELCOME_MANAGEMENT_COPY.defaultBadge}
        </span>
      ) : (
        <button
          className={styles.TribeWelcomeManagement__resetButton}
          onClick={onRestore}
          type={WELCOME_MANAGEMENT_REQUEST.buttonType}
        >
          {TRIBE_WELCOME_MANAGEMENT_COPY.resetDefaultLabel}
        </button>
      )}
    </span>
  );
}

type WelcomeTextFieldsProps = {
  hasValidationMessage: boolean;
  onTextChange: () => void;
  texts: WelcomeTexts;
};

/** Greeting and member selection modal copy fields. */
function WelcomeModalTextFields({
  hasValidationMessage,
  onTextChange,
  texts,
}: WelcomeTextFieldsProps) {
  const selectionModalTitleId = useId();
  const selectionModalDescriptionId = useId();
  const selectionModalBenefitId = useId();

  return (
    <>
      <div className={REQUIRED_FIELD_CLASS_NAME}>
        <Input
          aria-required
          description={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalTitleHint}
          error={
            hasValidationMessage && isRequiredTextMissing(texts.selectionModalTitle)
              ? TRIBE_WELCOME_MANAGEMENT_COPY.requiredSelectionModalTitle
              : undefined
          }
          id={selectionModalTitleId}
          label={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalTitleLabel}
          onChange={(event) => {
            texts.setSelectionModalTitle(event.target.value);
            onTextChange();
          }}
          placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalTitlePlaceholder}
          value={texts.selectionModalTitle}
        />
        <DefaultValueHint
          isDefault={texts.selectionModalTitle.trim() === DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_TITLE}
          onRestore={() => {
            texts.setSelectionModalTitle(DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_TITLE);
            onTextChange();
          }}
        />
      </div>

      <div className={REQUIRED_FIELD_CLASS_NAME}>
        <Textarea
          aria-required
          description={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalDescriptionHint}
          error={
            hasValidationMessage && isRequiredTextMissing(texts.selectionModalDescription)
              ? TRIBE_WELCOME_MANAGEMENT_COPY.requiredSelectionModalDescription
              : undefined
          }
          id={selectionModalDescriptionId}
          label={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalDescriptionLabel}
          onChange={(event) => {
            texts.setSelectionModalDescription(event.target.value);
            onTextChange();
          }}
          placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalDescriptionPlaceholder}
          rows={3}
          value={texts.selectionModalDescription}
        />
        <DefaultValueHint
          isDefault={texts.selectionModalDescription.trim() === DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_DESCRIPTION}
          onRestore={() => {
            texts.setSelectionModalDescription(DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_DESCRIPTION);
            onTextChange();
          }}
        />
      </div>

      <Textarea
        description={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalBenefitHint}
        id={selectionModalBenefitId}
        label={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalBenefitLabel}
        onChange={(event) => {
          texts.setSelectionModalBenefit(event.target.value);
          onTextChange();
        }}
        placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.selectionModalBenefitPlaceholder}
        rows={3}
        value={texts.selectionModalBenefit}
      />
    </>
  );
}

/** Greeting field, the selection modal copy and the resources heading. */
function WelcomeTextFields({
  hasValidationMessage,
  onTextChange,
  texts,
}: WelcomeTextFieldsProps) {
  const welcomeMessageId = useId();
  const linksHeadingId = useId();

  return (
    <>
      <div className={styles.TribeWelcomeManagement__field}>
        <Textarea
          description={TRIBE_WELCOME_MANAGEMENT_COPY.welcomeMessageHint}
          id={welcomeMessageId}
          label={TRIBE_WELCOME_MANAGEMENT_COPY.welcomeMessageLabel}
          onChange={(event) => {
            texts.setWelcomeMessage(event.target.value);
            onTextChange();
          }}
          placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.welcomeMessagePlaceholder}
          rows={3}
          value={texts.welcomeMessage}
        />
        <DefaultValueHint
          isDefault={texts.welcomeMessage.trim() === DEFAULT_TRIBE_WELCOME_MESSAGE}
          onRestore={() => {
            texts.setWelcomeMessage(DEFAULT_TRIBE_WELCOME_MESSAGE);
            onTextChange();
          }}
        />
      </div>

      <WelcomeModalTextFields
        hasValidationMessage={hasValidationMessage}
        onTextChange={onTextChange}
        texts={texts}
      />

      <div className={REQUIRED_FIELD_CLASS_NAME}>
        <Input
          aria-required
          description={TRIBE_WELCOME_MANAGEMENT_COPY.linksHeadingHint}
          error={
            hasValidationMessage && isRequiredTextMissing(texts.linksHeading)
              ? TRIBE_WELCOME_MANAGEMENT_COPY.requiredLinksHeading
              : undefined
          }
          id={linksHeadingId}
          label={TRIBE_WELCOME_MANAGEMENT_COPY.linksHeadingLabel}
          onChange={(event) => {
            texts.setLinksHeading(event.target.value);
            onTextChange();
          }}
          placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.linksHeadingPlaceholder}
          value={texts.linksHeading}
        />
        <DefaultValueHint
          isDefault={texts.linksHeading.trim() === DEFAULT_TRIBE_WELCOME_LINKS_HEADING}
          onRestore={() => {
            texts.setLinksHeading(DEFAULT_TRIBE_WELCOME_LINKS_HEADING);
            onTextChange();
          }}
        />
      </div>
    </>
  );
}

type CollectionHeaderProps = {
  addButtonRef: RefObject<HTMLButtonElement | null>;
  addLabel: string;
  count: number;
  emptyLabel: string;
  heading: string;
  onAdd: () => void;
};

/** Heading, count, add action and empty state of a rules or links collection. */
function WelcomeCollectionHeader({
  addButtonRef,
  addLabel,
  count,
  emptyLabel,
  heading,
  onAdd,
}: CollectionHeaderProps) {
  return (
    <>
      <div className={styles.TribeWelcomeManagement__collectionHeader}>
        <div className={styles.TribeWelcomeManagement__sectionTitleGroup}>
          <h2 className={styles.TribeWelcomeManagement__subtitle}>{heading}</h2>
          <span className={styles.TribeWelcomeManagement__count}>
            <AnimatedCount value={count} />
          </span>
        </div>
        <Button
          onClick={onAdd}
          ref={addButtonRef}
          type={WELCOME_MANAGEMENT_REQUEST.buttonType}
          variant={WELCOME_MANAGEMENT_REQUEST.secondaryVariant}
        >
          <PlusIcon />
          {addLabel}
        </Button>
      </div>
      {count === 0 ? (
        <p className={styles.TribeWelcomeManagement__emptyState}>{emptyLabel}</p>
      ) : null}
    </>
  );
}

type RowActionsProps = {
  isActive: boolean;
  legend: string;
  onActiveChange: (checked: boolean) => void;
  onRemove: () => void;
  removeTitle: string;
};

/** Active switch and remove button of a rule or link row. */
function WelcomeRowActions({
  isActive,
  legend,
  onActiveChange,
  onRemove,
  removeTitle,
}: RowActionsProps) {
  return (
    <div className={styles.TribeWelcomeManagement__rowActions}>
      <label className={styles.TribeWelcomeManagement__checkLabel}>
        <Switch checked={isActive} onCheckedChange={onActiveChange} />
        {getActiveStateLabel(isActive)}
      </label>
      <Button
        aria-label={TRIBE_WELCOME_MANAGEMENT_COPY.removeItemLabel(legend)}
        className={styles.TribeWelcomeManagement__removeButton}
        onClick={onRemove}
        size={WELCOME_MANAGEMENT_REQUEST.iconButtonSize}
        title={removeTitle}
        type={WELCOME_MANAGEMENT_REQUEST.buttonType}
        variant={WELCOME_MANAGEMENT_REQUEST.dangerVariant}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

type WelcomeRuleRowProps = {
  buildFocusRef: FocusRefFactory;
  legend: string;
  onRemove: (ruleId: string) => void;
  onUpdate: (ruleId: string, patch: Partial<TribeWelcomeRuleResult>) => void;
  rule: TribeWelcomeRuleResult;
  showLabelError: boolean;
};

/** One agreement with its text, active switch and remove action. */
function WelcomeRuleRow({
  buildFocusRef,
  legend,
  onRemove,
  onUpdate,
  rule,
  showLabelError,
}: WelcomeRuleRowProps) {
  const ruleInputId = "rule-input-" + rule.id;

  return (
    <fieldset className={ROW_WITH_HEADER_CLASS_NAME}>
      <legend className={styles.TribeWelcomeManagement__legend}>{legend}</legend>
      <label
        className={
          styles.TribeWelcomeManagement__fieldLabel +
          " " +
          styles["TribeWelcomeManagement__fieldLabel--required"] +
          " " +
          styles.TribeWelcomeManagement__rowLabel
        }
        htmlFor={ruleInputId}
      >
        {TRIBE_WELCOME_MANAGEMENT_COPY.ruleLabel}
      </label>
      <WelcomeRowActions
        isActive={rule.isActive}
        legend={legend}
        onActiveChange={(checked) => onUpdate(rule.id, { isActive: checked })}
        onRemove={() => onRemove(rule.id)}
        removeTitle={TRIBE_WELCOME_MANAGEMENT_COPY.removeRuleTitle}
      />
      <div className={styles.TribeWelcomeManagement__rowField}>
        <Textarea
          aria-required
          description={TRIBE_WELCOME_MANAGEMENT_COPY.ruleHint}
          error={
            showLabelError
              ? TRIBE_WELCOME_MANAGEMENT_COPY.requiredRuleLabel
              : undefined
          }
          id={ruleInputId}
          onChange={(event) => onUpdate(rule.id, { label: event.target.value })}
          placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.rulePlaceholder}
          ref={buildFocusRef(rule.id)}
          rows={2}
          value={rule.label}
        />
      </div>
    </fieldset>
  );
}

type WelcomeRulesSectionProps = {
  buildFocusRef: FocusRefFactory;
  collections: WelcomeCollections;
  handlers: ReturnType<typeof createRuleHandlers>;
  missingLabelRuleIds: IdSet;
};

/** Agreements collection of the welcome. */
function WelcomeRulesSection({
  buildFocusRef,
  collections,
  handlers,
  missingLabelRuleIds,
}: WelcomeRulesSectionProps) {
  const { rules } = collections;

  return (
    <section className={styles.TribeWelcomeManagement__collection}>
      <WelcomeCollectionHeader
        addButtonRef={collections.addRuleButtonRef}
        addLabel={TRIBE_WELCOME_MANAGEMENT_COPY.addRuleButton}
        count={rules.length}
        emptyLabel={TRIBE_WELCOME_MANAGEMENT_COPY.emptyRules}
        heading={TRIBE_WELCOME_MANAGEMENT_COPY.rulesHeading}
        onAdd={handlers.handleAddRule}
      />
      <AnimatePresence initial={false}>
        {rules.map((rule, ruleIndex) => (
          <AnimatedListItem as="div" key={rule.id}>
            <WelcomeRuleRow
              buildFocusRef={buildFocusRef}
              legend={buildLegend(
                TRIBE_WELCOME_MANAGEMENT_COPY.ruleLegendPrefix,
                ruleIndex,
                rules.length
              )}
              onRemove={handlers.handleRemoveRule}
              onUpdate={handlers.updateRule}
              rule={rule}
              showLabelError={missingLabelRuleIds.has(rule.id)}
            />
          </AnimatedListItem>
        ))}
      </AnimatePresence>
    </section>
  );
}

type LinkFieldProps = {
  link: TribeWelcomeLinkResult;
  onUpdate: (linkId: string, patch: Partial<TribeWelcomeLinkResult>) => void;
};

/** Destination of a link: the WhatsApp phone, or the URL with its blur check. */
function WelcomeLinkDestinationField({
  buildFocusRef,
  link,
  onMarkUrlValidity,
  onUpdate,
  showPhoneError,
  showUrlError,
}: LinkFieldProps & {
  buildFocusRef: FocusRefFactory;
  onMarkUrlValidity: (linkId: string, isValid: boolean) => void;
  showPhoneError: boolean;
  showUrlError: boolean;
}) {
  if (link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton) {
    return (
      <div className={REQUIRED_FIELD_GROUP_CLASS_NAME}>
        <Input
          aria-required
          description={TRIBE_WELCOME_MANAGEMENT_COPY.linkPhoneHint}
          error={getPhoneErrorMessage(showPhoneError, link)}
          label={TRIBE_WELCOME_MANAGEMENT_COPY.linkPhoneLabel}
          onChange={(event) =>
            onUpdate(link.id, {
              phoneNumber: event.target.value,
            })
          }
          placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.linkPhonePlaceholder}
          ref={buildFocusRef(link.id)}
          value={link.phoneNumber ?? ""}
        />
      </div>
    );
  }

  return (
    <div className={REQUIRED_FIELD_GROUP_CLASS_NAME}>
      <Input
        aria-required
        description={
          showUrlError ? undefined : TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlHelper
        }
        error={getUrlErrorMessage(showUrlError, link)}
        label={TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlLabel}
        onBlur={(event) =>
          onMarkUrlValidity(link.id, isUrlWellFormed(event.target.value))
        }
        onChange={(event) => onUpdate(link.id, { url: event.target.value })}
        placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlPlaceholder}
        ref={buildFocusRef(link.id)}
        value={link.url ?? ""}
      />
    </div>
  );
}

/** Link type select. */
function WelcomeLinkTypeField({ link, onUpdate }: LinkFieldProps) {
  return (
    <div
      className={
        styles.TribeWelcomeManagement__field +
        " " +
        styles["TribeWelcomeManagement__field--full"]
      }
    >
      <span className={styles.TribeWelcomeManagement__fieldHelper}>
        {TRIBE_WELCOME_MANAGEMENT_COPY.linkTypeHint}
      </span>
      <select
        className={styles.TribeWelcomeManagement__select}
        id={"link-type-" + link.id}
        onChange={(event) =>
          onUpdate(link.id, {
            type: event.target.value as TribeWelcomeLinkResult["type"],
          })
        }
        value={link.type}
      >
        {Object.values(TRIBE_WELCOME_LINK_TYPE).map((type) => (
          <option key={type} value={type}>
            {WELCOME_LINK_TYPE_LABEL[type]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Badge label of a link with its character counter. */
function WelcomeLinkBadgeField({
  link,
  onUpdate,
  showBadgeLabelError,
}: LinkFieldProps & { showBadgeLabelError: boolean }) {
  const badgeLabelHelperId = useId() + link.id;

  return (
    <div className={REQUIRED_FIELD_GROUP_CLASS_NAME}>
      <Input
        aria-describedby={showBadgeLabelError ? undefined : badgeLabelHelperId}
        aria-required
        description={TRIBE_WELCOME_MANAGEMENT_COPY.badgeLabelHint}
        error={
          showBadgeLabelError
            ? TRIBE_WELCOME_MANAGEMENT_COPY.requiredBadgeLabel
            : undefined
        }
        label={TRIBE_WELCOME_MANAGEMENT_COPY.badgeLabelLabel}
        maxLength={BADGE_LABEL_MAX_LENGTH}
        onChange={(event) =>
          onUpdate(link.id, {
            badgeLabel: event.target.value,
          })
        }
        placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.badgeLabelPlaceholder}
        value={link.badgeLabel}
      />
      {showBadgeLabelError ? null : (
        <span
          className={styles.TribeWelcomeManagement__fieldHelper}
          id={badgeLabelHelperId}
        >
          {TRIBE_WELCOME_MANAGEMENT_COPY.badgeLabelHelper(
            link.badgeLabel.length,
            BADGE_LABEL_MAX_LENGTH
          )}
        </span>
      )}
    </div>
  );
}

/** Label, description and, for WhatsApp links, the prefilled message of a link. */
function WelcomeLinkTextFields({
  link,
  onUpdate,
  showLinkLabelError,
}: LinkFieldProps & { showLinkLabelError: boolean }) {
  return (
    <>
      <div className={REQUIRED_FIELD_GROUP_CLASS_NAME}>
        <Textarea
          aria-required
          description={TRIBE_WELCOME_MANAGEMENT_COPY.linkLabelHint}
          error={
            showLinkLabelError
              ? TRIBE_WELCOME_MANAGEMENT_COPY.requiredLinkLabel
              : undefined
          }
          label={TRIBE_WELCOME_MANAGEMENT_COPY.linkLabel}
          onChange={(event) => onUpdate(link.id, { label: event.target.value })}
          placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.linkLabelPlaceholder}
          rows={2}
          value={link.label}
        />
      </div>
      <Textarea
        description={TRIBE_WELCOME_MANAGEMENT_COPY.linkDescriptionHint}
        label={TRIBE_WELCOME_MANAGEMENT_COPY.linkDescriptionLabel}
        onChange={(event) =>
          onUpdate(link.id, {
            description: event.target.value || null,
          })
        }
        placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.linkDescriptionPlaceholder}
        rows={2}
        value={link.description ?? ""}
      />
    </>
  );
}

/** Prefilled message of a WhatsApp link. */
function WelcomeLinkMessageField({ link, onUpdate }: LinkFieldProps) {
  if (link.type !== TRIBE_WELCOME_LINK_TYPE.whatsappButton) {
    return null;
  }

  return (
    <Textarea
      description={TRIBE_WELCOME_MANAGEMENT_COPY.linkMessageHint}
      label={TRIBE_WELCOME_MANAGEMENT_COPY.linkMessageLabel}
      onChange={(event) =>
        onUpdate(link.id, {
          message: event.target.value,
        })
      }
      placeholder={TRIBE_WELCOME_MANAGEMENT_COPY.linkMessagePlaceholder}
      rows={3}
      value={link.message ?? ""}
    />
  );
}

type WelcomeLinkRowProps = LinkFieldProps & {
  buildFocusRef: FocusRefFactory;
  legend: string;
  onMarkUrlValidity: (linkId: string, isValid: boolean) => void;
  onRemove: (linkId: string) => void;
  validation: WelcomeValidation;
};

/** One resource link with its fields, active switch and remove action. */
function WelcomeLinkRow({
  buildFocusRef,
  legend,
  link,
  onMarkUrlValidity,
  onRemove,
  onUpdate,
  validation,
}: WelcomeLinkRowProps) {
  return (
    <fieldset className={ROW_WITH_HEADER_CLASS_NAME}>
      <legend className={styles.TribeWelcomeManagement__legend}>{legend}</legend>
      <label
        className={
          styles.TribeWelcomeManagement__fieldLabel +
          " " +
          styles.TribeWelcomeManagement__rowLabel
        }
        htmlFor={"link-type-" + link.id}
      >
        {TRIBE_WELCOME_MANAGEMENT_COPY.linkTypeLabel}
      </label>
      <div
        className={
          styles.TribeWelcomeManagement__rowFields +
          " " +
          styles.TribeWelcomeManagement__rowField
        }
      >
        <WelcomeLinkTypeField link={link} onUpdate={onUpdate} />
        <WelcomeLinkDestinationField
          buildFocusRef={buildFocusRef}
          link={link}
          onMarkUrlValidity={onMarkUrlValidity}
          onUpdate={onUpdate}
          showPhoneError={validation.missingPhoneLinkIds.has(link.id)}
          showUrlError={validation.invalidUrlLinkIds.has(link.id)}
        />
        <WelcomeLinkTextFields
          link={link}
          onUpdate={onUpdate}
          showLinkLabelError={validation.missingLabelLinkIds.has(link.id)}
        />
        <WelcomeLinkBadgeField
          link={link}
          onUpdate={onUpdate}
          showBadgeLabelError={validation.missingBadgeLabelLinkIds.has(link.id)}
        />
        <WelcomeLinkMessageField link={link} onUpdate={onUpdate} />
      </div>
      <WelcomeRowActions
        isActive={link.isActive}
        legend={legend}
        onActiveChange={(checked) => onUpdate(link.id, { isActive: checked })}
        onRemove={() => onRemove(link.id)}
        removeTitle={TRIBE_WELCOME_MANAGEMENT_COPY.removeLinkTitle}
      />
    </fieldset>
  );
}

type WelcomeLinksSectionProps = {
  buildFocusRef: FocusRefFactory;
  collections: WelcomeCollections;
  handlers: ReturnType<typeof createLinkHandlers>;
  validation: WelcomeValidation;
};

/** Resource links collection of the welcome. */
function WelcomeLinksSection({
  buildFocusRef,
  collections,
  handlers,
  validation,
}: WelcomeLinksSectionProps) {
  const { links } = collections;

  return (
    <section className={styles.TribeWelcomeManagement__collection}>
      <WelcomeCollectionHeader
        addButtonRef={collections.addLinkButtonRef}
        addLabel={TRIBE_WELCOME_MANAGEMENT_COPY.addLinkButton}
        count={links.length}
        emptyLabel={TRIBE_WELCOME_MANAGEMENT_COPY.emptyLinks}
        heading={TRIBE_WELCOME_MANAGEMENT_COPY.resourcesHeading}
        onAdd={handlers.handleAddLink}
      />
      <AnimatePresence initial={false}>
        {links.map((link, linkIndex) => (
          <AnimatedListItem as="div" key={link.id}>
            <WelcomeLinkRow
              buildFocusRef={buildFocusRef}
              legend={buildLegend(
                TRIBE_WELCOME_MANAGEMENT_COPY.linkLegendPrefix,
                linkIndex,
                links.length
              )}
              link={link}
              onMarkUrlValidity={validation.markUrlValidity}
              onRemove={handlers.handleRemoveLink}
              onUpdate={handlers.updateLink}
              validation={validation}
            />
          </AnimatedListItem>
        ))}
      </AnimatePresence>
    </section>
  );
}

type WelcomePreviewProps = {
  currentWelcome: TribeWelcomeResult;
  hasActivePreviewLinks: boolean;
  onOpenSelectionModal: () => void;
};

/** Live preview of the welcome and the button that previews the selection modal. */
function WelcomePreview({
  currentWelcome,
  hasActivePreviewLinks,
  onOpenSelectionModal,
}: WelcomePreviewProps) {
  return (
    <aside
      aria-label={TRIBE_WELCOME_MANAGEMENT_COPY.previewSrLabel}
      className={styles.TribeWelcomeManagement__preview}
    >
      <div className={styles.TribeWelcomeManagement__previewHeader}>
        <p className={styles.TribeWelcomeManagement__previewEyebrow}>
          {TRIBE_WELCOME_MANAGEMENT_COPY.previewEyebrow}
        </p>
        <Button
          disabled={!hasActivePreviewLinks}
          onClick={onOpenSelectionModal}
          type={WELCOME_MANAGEMENT_REQUEST.buttonType}
          variant={WELCOME_MANAGEMENT_REQUEST.secondaryVariant}
        >
          {TRIBE_WELCOME_MANAGEMENT_COPY.previewModalButton}
        </Button>
      </div>
      {/* Not a live region: announcing the whole preview on every keystroke
          would drown the form for screen reader users. */}
      <div className={styles.TribeWelcomeManagement__previewSurface}>
        <TribeWelcomeDisplay welcome={currentWelcome} />
      </div>
      {!hasActivePreviewLinks ? (
        <p className={styles.TribeWelcomeManagement__previewHint}>
          {TRIBE_WELCOME_MANAGEMENT_COPY.previewModalEmpty}
        </p>
      ) : null}
    </aside>
  );
}

/** Validation summary and the save button of the editor. */
function WelcomeSubmitBar({
  isDisabled,
  isSaving,
  validationMessage,
}: {
  isDisabled: boolean;
  isSaving: boolean;
  validationMessage: string | null;
}) {
  return (
    <>
      {validationMessage ? (
        <p
          className={styles.TribeWelcomeManagement__error}
          role={WELCOME_MANAGEMENT_ARIA.roleAlert}
        >
          {validationMessage}
        </p>
      ) : null}

      <div className={styles.TribeWelcomeManagement__submitBar}>
        <Button
          aria-busy={isSaving || undefined}
          className={styles.TribeWelcomeManagement__submit}
          disabled={isDisabled}
          type={WELCOME_MANAGEMENT_REQUEST.submitButtonType}
        >
          {isSaving ? (
            <>
              <LoaderCircleIcon
                aria-hidden
                className={styles.TribeWelcomeManagement__submitSpinner}
              />
              {TRIBE_WELCOME_MANAGEMENT_COPY.savingButton}
            </>
          ) : (
            TRIBE_WELCOME_MANAGEMENT_COPY.saveButton
          )}
        </Button>
      </div>
    </>
  );
}

type WelcomeEditorModel = {
  collections: WelcomeCollections;
  currentWelcome: TribeWelcomeResult;
  isDirty: boolean;
  isPreviewModalOpen: boolean;
  setIsPreviewModalOpen: (isOpen: boolean) => void;
  save: WelcomeSaveState;
  texts: WelcomeTexts;
  validation: WelcomeValidation;
};

/** Welcome editor form with its live preview and the selection modal preview. */
function TribeWelcomeEditor({
  model,
  tribeSlug,
}: {
  model: WelcomeEditorModel;
  tribeSlug: string;
}) {
  const { collections, currentWelcome, isDirty, save, texts, validation } = model;
  const { isPreviewModalOpen, setIsPreviewModalOpen } = model;
  const hasActivePreviewLinks = collections.links.some((link) => link.isActive);
  const handleSubmit = createWelcomeSubmitHandler({ collections, currentWelcome, save, texts, tribeSlug, validation });
  const buildFocusRef = createFocusRefFactory(collections.pendingFocusIdRef);

  return (
    <section className={styles.TribeWelcomeManagement}>
      <WelcomeEditorHeader />

      <form
        className={styles.TribeWelcomeManagement__form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <WelcomeTextFields
          hasValidationMessage={validation.validationMessage !== null}
          onTextChange={() => validation.setValidationMessage(null)}
          texts={texts}
        />
        <WelcomeRulesSection
          buildFocusRef={buildFocusRef}
          collections={collections}
          handlers={createRuleHandlers({ collections, validation })}
          missingLabelRuleIds={validation.missingLabelRuleIds}
        />
        <WelcomeLinksSection
          buildFocusRef={buildFocusRef}
          collections={collections}
          handlers={createLinkHandlers({ collections, validation })}
          validation={validation}
        />
        <WelcomePreview
          currentWelcome={currentWelcome}
          hasActivePreviewLinks={hasActivePreviewLinks}
          onOpenSelectionModal={() => setIsPreviewModalOpen(true)}
        />

        {/* Kept mounted so the dialog can play its exit animation and return
            focus to the "Ver modal de selección" button when it closes. */}
        <TribeWelcomeSelectionModal
          benefit={currentWelcome.selectionModalBenefit}
          description={texts.selectionModalDescription}
          links={collections.links}
          onClose={() => setIsPreviewModalOpen(false)}
          open={isPreviewModalOpen}
          previewOnly
          title={texts.selectionModalTitle}
          tribeSlug={tribeSlug}
        />

        <WelcomeSubmitBar
          isDisabled={save.isSaving || !isDirty}
          isSaving={save.isSaving}
          validationMessage={validation.validationMessage}
        />
      </form>
    </section>
  );
}

/**
 * Welcome editor for tribe leaders: greeting, selection modal copy, agreements
 * and resource links, with inline validation, a live preview and a preview of
 * the member selection modal. Non-leaders get the read-only welcome display.
 */
export function TribeWelcomeManagement({
  canEdit,
  canRecordSelections = false,
  tribeSlug,
  welcome,
}: TribeWelcomeManagementProps) {
  const texts = useWelcomeTexts(welcome);
  const collections = useWelcomeCollections(welcome);
  const validation = useWelcomeValidation();
  const save = useWelcomeSaveState(welcome);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const { links, rules } = collections;
  const { linksHeading, selectionModalBenefit, selectionModalDescription, selectionModalTitle, welcomeMessage } = texts;
  const currentWelcome = useMemo(
    () => ({
      linksHeading,
      links,
      rules,
      selectionModalBenefit: selectionModalBenefit.trim()
        ? selectionModalBenefit
        : null,
      selectionModalDescription,
      selectionModalTitle,
      welcomeMessage,
    }),
    [
      links,
      linksHeading,
      rules,
      selectionModalBenefit,
      selectionModalDescription,
      selectionModalTitle,
      welcomeMessage,
    ]
  );
  const isDirty = useMemo(
    () => !areWelcomesEqual(currentWelcome, save.savedWelcome),
    [currentWelcome, save.savedWelcome]
  );

  if (!canEdit) {
    return (
      <TribeWelcomeDisplay
        tribeSlug={canRecordSelections ? tribeSlug : undefined}
        welcome={welcome}
      />
    );
  }

  return (
    <TribeWelcomeEditor
      model={{ collections, currentWelcome, isDirty, isPreviewModalOpen, save, setIsPreviewModalOpen, texts, validation }}
      tribeSlug={tribeSlug}
    />
  );
}
