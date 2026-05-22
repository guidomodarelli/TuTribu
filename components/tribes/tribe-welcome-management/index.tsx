"use client";

import { useId, useMemo, useRef, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { isValidPhoneNumber } from "libphonenumber-js";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TribeWelcomeDisplay } from "@/components/tribes/tribe-welcome-display";
import { TribeWelcomeSelectionModal } from "@/components/tribes/tribe-welcome-selection-modal";
import type {
  TribeWelcomeLinkResult,
  TribeWelcomeResult,
  TribeWelcomeRuleResult,
} from "@/src/modules/tribes/application/results/tribe-welcome-result";
import {
  DEFAULT_TRIBE_WELCOME_MESSAGE,
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
    "Aparece como chip junto a cada miembro que lo elige. Usá un texto breve y claro, en oraciones.",
  badgeLabelLabel: "Texto del badge",
  badgeLabelPlaceholder: "Ej.: Cambiar asesor",
  linkDescriptionLabel: "Descripción",
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
  linkLabel: "Texto del link",
  linkLabelPlaceholder: "Ej.: Unirse al canal",
  linkLegendPrefix: "Link",
  linkMessageLabel: "Mensaje personalizado",
  linkMessagePlaceholder: "Ej.: Hola, vengo",
  linkPhoneLabel: "Teléfono de WhatsApp",
  linkPhonePlaceholder: "+54 9 11 1234 5678",
  linkTypeLabel: "Tipo de link",
  linkUrlHelper: "Pegá un enlace completo, incluido https://",
  linkUrlInvalid: "Ingresá una URL válida que empiece con http:// o https://",
  linkUrlLabel: "URL",
  linkUrlPlaceholder: "https://...",
  previewEyebrow: "Vista previa",
  previewModalButton: "Ver modal de selección",
  previewModalEmpty: "Activá al menos un link para previsualizar el modal.",
  previewSrLabel: "Vista previa de la bienvenida",
  removeItemLabel: "Eliminar",
  removeLinkTitle: "Eliminar link",
  removeRuleTitle: "Eliminar acuerdo",
  requiredBadgeLabel: "Ingresá un texto para el badge.",
  requiredHelper: "Obligatorio",
  resetDefaultLabel: "Restaurar predeterminado",
  resourcesHeading: "Recursos y links",
  ruleLabel: "Acuerdo",
  ruleLegendPrefix: "Acuerdo",
  rulePlaceholder: "Ej.: Respetar el descanso",
  rulesHeading: "Acuerdos de convivencia",
  requiredLinkLabel: "Ingresá un texto para el link.",
  requiredLinkUrl: "Ingresá una URL.",
  requiredRuleLabel: "Escribí el acuerdo antes de guardar.",
  saveButton: "Guardar bienvenida",
  saveSuccess: "Bienvenida actualizada.",
  validationSummary: "Revisá los campos marcados antes de guardar.",
  validationWhatsappPhone:
    "Completá el teléfono de WhatsApp para guardar ese link.",
  validationWhatsappPhoneInvalid:
    "Ingresá un número válido en formato internacional (ej.: +54 9 11 1234 5678).",
  welcomeMessageLabel: "Mensaje de bienvenida",
  welcomeMessagePlaceholder: "Ej.: Bienvenido/a a la tribu",
} as const;

const WELCOME_MANAGEMENT_ROUTE = {
  apiPrefix: "/api/tribes/",
  welcomeSegment: "/welcome",
} as const;

const WELCOME_MANAGEMENT_REQUEST = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  destructiveVariant: "destructive",
  iconButtonSize: "icon",
  jsonContentType: "application/json",
  outlineVariant: "outline",
  putMethod: "PUT",
  submitButtonType: "submit",
} as const;

const WELCOME_MANAGEMENT_TEXT = {
  legendSeparator: " ",
} as const;

const WELCOME_MANAGEMENT_ARIA = {
  ariaHiddenTrue: "true",
  ariaLivePolite: "polite",
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

function createEmptyRule(sortOrder: number): TribeWelcomeRuleResult {
  return {
    id: createClientId(),
    isActive: true,
    label: "",
    sortOrder,
  };
}

function createEmptyLink(sortOrder: number): TribeWelcomeLinkResult {
  return {
    badgeLabel: "",
    description: null,
    id: createClientId(),
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
  const responseBody = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? TRIBE_WELCOME_MANAGEMENT_COPY.fallbackSaveError
    );
  }

  return responseBody.message ?? TRIBE_WELCOME_MANAGEMENT_COPY.saveSuccess;
}

export function TribeWelcomeManagement({
  canEdit,
  canRecordSelections = false,
  tribeSlug,
  welcome,
}: TribeWelcomeManagementProps) {
  const [welcomeMessage, setWelcomeMessage] = useState(welcome.welcomeMessage);
  const [rules, setRules] = useState(welcome.rules);
  const [links, setLinks] = useState(welcome.links);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [invalidUrlLinkIds, setInvalidUrlLinkIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [missingLabelRuleIds, setMissingLabelRuleIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [missingLabelLinkIds, setMissingLabelLinkIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [missingPhoneLinkIds, setMissingPhoneLinkIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [missingBadgeLabelLinkIds, setMissingBadgeLabelLinkIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const phoneErrorIdPrefix = useId();
  const urlErrorIdPrefix = useId();
  const urlHelperIdPrefix = useId();
  const ruleLabelErrorIdPrefix = useId();
  const linkLabelErrorIdPrefix = useId();
  const badgeLabelErrorIdPrefix = useId();
  const badgeLabelHelperIdPrefix = useId();
  const welcomeMessageId = useId();
  const pendingFocusIdRef = useRef<string | null>(null);
  const currentWelcome = useMemo(
    () => ({
      links,
      rules,
      welcomeMessage,
    }),
    [links, rules, welcomeMessage]
  );
  const hasActivePreviewLinks = useMemo(
    () => links.some((link) => link.isActive),
    [links]
  );
  const isWelcomeMessageDefault =
    welcomeMessage.trim() === DEFAULT_TRIBE_WELCOME_MESSAGE;

  if (!canEdit) {
    return (
      <TribeWelcomeDisplay
        tribeSlug={canRecordSelections ? tribeSlug : undefined}
        welcome={welcome}
      />
    );
  }

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
  const clearIdFromSet =
    (setter: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>) =>
    (id: string) => {
      setter((current) => {
        if (!current.has(id)) {
          return current;
        }

        const next = new Set(current);

        next.delete(id);

        return next;
      });
    };
  const clearMissingLabelRule = clearIdFromSet(setMissingLabelRuleIds);
  const clearMissingLabelLink = clearIdFromSet(setMissingLabelLinkIds);
  const clearMissingPhoneLink = clearIdFromSet(setMissingPhoneLinkIds);
  const clearMissingBadgeLabelLink = clearIdFromSet(setMissingBadgeLabelLinkIds);
  const updateRule = (
    ruleId: string,
    patch: Partial<TribeWelcomeRuleResult>
  ) => {
    setRules((currentRules) =>
      currentRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...patch } : rule
      )
    );
    setValidationMessage(null);

    if (Object.prototype.hasOwnProperty.call(patch, WELCOME_RULE_PATCH_KEY.label)) {
      clearMissingLabelRule(ruleId);
    }
  };
  const updateLink = (
    linkId: string,
    patch: Partial<TribeWelcomeLinkResult>
  ) => {
    setLinks((currentLinks) =>
      currentLinks.map((link) =>
        link.id === linkId ? { ...link, ...patch } : link
      )
    );
    setValidationMessage(null);

    if (
      Object.prototype.hasOwnProperty.call(patch, WELCOME_LINK_PATCH_KEY.url)
    ) {
      markUrlValidity(linkId, true);
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, WELCOME_LINK_PATCH_KEY.label)
    ) {
      clearMissingLabelLink(linkId);
    }
    if (
      Object.prototype.hasOwnProperty.call(
        patch,
        WELCOME_LINK_PATCH_KEY.phoneNumber
      )
    ) {
      clearMissingPhoneLink(linkId);
    }
    if (
      Object.prototype.hasOwnProperty.call(
        patch,
        WELCOME_LINK_PATCH_KEY.badgeLabel
      )
    ) {
      clearMissingBadgeLabelLink(linkId);
    }
  };
  const handleAddRule = () => {
    setRules((currentRules) => {
      const created = createEmptyRule(getNextSortOrder(currentRules));

      pendingFocusIdRef.current = created.id;

      return [...currentRules, created];
    });
  };
  const handleAddLink = () => {
    setLinks((currentLinks) => {
      const created = createEmptyLink(getNextSortOrder(currentLinks));

      pendingFocusIdRef.current = created.id;

      return [...currentLinks, created];
    });
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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

    setInvalidUrlLinkIds(nextInvalidUrls);
    setMissingLabelRuleIds(nextMissingRuleLabels);
    setMissingLabelLinkIds(nextMissingLinkLabels);
    setMissingPhoneLinkIds(nextMissingPhones);
    setMissingBadgeLabelLinkIds(nextMissingBadgeLabels);

    const hasClientSideErrors =
      nextInvalidUrls.size > 0 ||
      nextMissingRuleLabels.size > 0 ||
      nextMissingLinkLabels.size > 0 ||
      nextMissingPhones.size > 0 ||
      nextMissingBadgeLabels.size > 0;

    if (hasClientSideErrors) {
      setValidationMessage(TRIBE_WELCOME_MANAGEMENT_COPY.validationSummary);
      return;
    }

    setIsSaving(true);
    setValidationMessage(null);

    try {
      const message = await submitWelcomeUpdate(
        tribeSlug,
        sanitizeWelcomeForSave(currentWelcome)
      );

      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : TRIBE_WELCOME_MANAGEMENT_COPY.fallbackSaveError
      );
    } finally {
      setIsSaving(false);
    }
  };
  const handleRestoreDefaultMessage = () => {
    setWelcomeMessage(DEFAULT_TRIBE_WELCOME_MESSAGE);
    setValidationMessage(null);
  };
  const buildFocusRef =
    (id: string) =>
    (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (element && pendingFocusIdRef.current === id) {
        element.focus();
        pendingFocusIdRef.current = null;
      }
    };
  const getActiveStateLabel = (isActive: boolean) =>
    isActive
      ? TRIBE_WELCOME_MANAGEMENT_COPY.activeLabel
      : TRIBE_WELCOME_MANAGEMENT_COPY.inactiveLabel;
  const renderRequiredLabel = (text: string) => (
    <span
      className={
        styles.TribeWelcomeManagement__fieldLabel +
        " " +
        styles["TribeWelcomeManagement__fieldLabel--required"]
      }
    >
      {text}
    </span>
  );

  return (
    <section className={styles.TribeWelcomeManagement}>
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

      <form
        className={styles.TribeWelcomeManagement__form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
          <div className={styles.TribeWelcomeManagement__field}>
            <label
              className={styles.TribeWelcomeManagement__fieldLabel}
              htmlFor={welcomeMessageId}
            >
              {TRIBE_WELCOME_MANAGEMENT_COPY.welcomeMessageLabel}
            </label>
            <Textarea
              className={styles.TribeWelcomeManagement__textarea}
              id={welcomeMessageId}
              onChange={(event) => {
                setWelcomeMessage(event.target.value);
                setValidationMessage(null);
              }}
              placeholder={
                TRIBE_WELCOME_MANAGEMENT_COPY.welcomeMessagePlaceholder
              }
              rows={3}
              value={welcomeMessage}
            />
            <span className={styles.TribeWelcomeManagement__defaultHint}>
              {isWelcomeMessageDefault ? (
                <span className={styles.TribeWelcomeManagement__defaultBadge}>
                  {TRIBE_WELCOME_MANAGEMENT_COPY.defaultBadge}
                </span>
              ) : (
                <button
                  className={styles.TribeWelcomeManagement__resetButton}
                  onClick={handleRestoreDefaultMessage}
                  type={WELCOME_MANAGEMENT_REQUEST.buttonType}
                >
                  {TRIBE_WELCOME_MANAGEMENT_COPY.resetDefaultLabel}
                </button>
              )}
            </span>
          </div>

          <section className={styles.TribeWelcomeManagement__collection}>
            <div className={styles.TribeWelcomeManagement__collectionHeader}>
              <div className={styles.TribeWelcomeManagement__sectionTitleGroup}>
                <h2 className={styles.TribeWelcomeManagement__subtitle}>
                  {TRIBE_WELCOME_MANAGEMENT_COPY.rulesHeading}
                </h2>
                <span className={styles.TribeWelcomeManagement__count}>
                  {rules.length}
                </span>
              </div>
              <Button
                onClick={handleAddRule}
                type={WELCOME_MANAGEMENT_REQUEST.buttonType}
                variant={WELCOME_MANAGEMENT_REQUEST.outlineVariant}
              >
                <PlusIcon />
                {TRIBE_WELCOME_MANAGEMENT_COPY.addRuleButton}
              </Button>
            </div>
            {rules.length === 0 ? (
              <p className={styles.TribeWelcomeManagement__emptyState}>
                {TRIBE_WELCOME_MANAGEMENT_COPY.emptyRules}
              </p>
            ) : null}
            {rules.map((rule, ruleIndex) => {
              const ruleInputId = "rule-input-" + rule.id;
              const ruleErrorId = ruleLabelErrorIdPrefix + rule.id;
              const showRuleLabelError = missingLabelRuleIds.has(rule.id);

              return (
                <fieldset
                  className={
                    styles.TribeWelcomeManagement__row +
                    " " +
                    styles["TribeWelcomeManagement__row--withHeader"]
                  }
                  key={rule.id}
                >
                  <legend className={styles.TribeWelcomeManagement__legend}>
                    {buildLegend(
                      TRIBE_WELCOME_MANAGEMENT_COPY.ruleLegendPrefix,
                      ruleIndex,
                      rules.length
                    )}
                  </legend>
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
                  <div className={styles.TribeWelcomeManagement__rowActions}>
                    <label
                      className={styles.TribeWelcomeManagement__checkLabel}
                    >
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={(checked) =>
                          updateRule(rule.id, { isActive: checked === true })
                        }
                      />
                      {getActiveStateLabel(rule.isActive)}
                    </label>
                    <Button
                      aria-label={
                        TRIBE_WELCOME_MANAGEMENT_COPY.removeItemLabel
                      }
                      className={styles.TribeWelcomeManagement__removeButton}
                      onClick={() =>
                        setRules((currentRules) =>
                          currentRules.filter(
                            (currentRule) => currentRule.id !== rule.id
                          )
                        )
                      }
                      size={WELCOME_MANAGEMENT_REQUEST.iconButtonSize}
                      title={TRIBE_WELCOME_MANAGEMENT_COPY.removeRuleTitle}
                      type={WELCOME_MANAGEMENT_REQUEST.buttonType}
                      variant={WELCOME_MANAGEMENT_REQUEST.destructiveVariant}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div className={styles.TribeWelcomeManagement__rowField}>
                    <Textarea
                      aria-describedby={
                        showRuleLabelError ? ruleErrorId : undefined
                      }
                      aria-invalid={showRuleLabelError}
                      aria-required
                      className={styles.TribeWelcomeManagement__textarea}
                      id={ruleInputId}
                      onChange={(event) =>
                        updateRule(rule.id, { label: event.target.value })
                      }
                      placeholder={
                        TRIBE_WELCOME_MANAGEMENT_COPY.rulePlaceholder
                      }
                      ref={buildFocusRef(rule.id)}
                      rows={2}
                      value={rule.label}
                    />
                    {showRuleLabelError ? (
                      <span
                        className={
                          styles.TribeWelcomeManagement__fieldError
                        }
                        id={ruleErrorId}
                      >
                        {TRIBE_WELCOME_MANAGEMENT_COPY.requiredRuleLabel}
                      </span>
                    ) : null}
                  </div>
                </fieldset>
              );
            })}
          </section>

          <section className={styles.TribeWelcomeManagement__collection}>
            <div className={styles.TribeWelcomeManagement__collectionHeader}>
              <div className={styles.TribeWelcomeManagement__sectionTitleGroup}>
                <h2 className={styles.TribeWelcomeManagement__subtitle}>
                  {TRIBE_WELCOME_MANAGEMENT_COPY.resourcesHeading}
                </h2>
                <span className={styles.TribeWelcomeManagement__count}>
                  {links.length}
                </span>
              </div>
              <Button
                onClick={handleAddLink}
                type={WELCOME_MANAGEMENT_REQUEST.buttonType}
                variant={WELCOME_MANAGEMENT_REQUEST.outlineVariant}
              >
                <PlusIcon />
                {TRIBE_WELCOME_MANAGEMENT_COPY.addLinkButton}
              </Button>
            </div>
            {links.length === 0 ? (
              <p className={styles.TribeWelcomeManagement__emptyState}>
                {TRIBE_WELCOME_MANAGEMENT_COPY.emptyLinks}
              </p>
            ) : null}
            {links.map((link, linkIndex) => {
              const phoneErrorId = phoneErrorIdPrefix + link.id;
              const urlErrorId = urlErrorIdPrefix + link.id;
              const urlHelperId = urlHelperIdPrefix + link.id;
              const linkLabelErrorId = linkLabelErrorIdPrefix + link.id;
              const badgeLabelErrorId = badgeLabelErrorIdPrefix + link.id;
              const badgeLabelHelperId = badgeLabelHelperIdPrefix + link.id;
              const linkTypeSelectId = "link-type-" + link.id;
              const showPhoneError = missingPhoneLinkIds.has(link.id);
              const showUrlError = invalidUrlLinkIds.has(link.id);
              const showLinkLabelError = missingLabelLinkIds.has(link.id);
              const showBadgeLabelError = missingBadgeLabelLinkIds.has(link.id);

              return (
                <fieldset
                  className={
                    styles.TribeWelcomeManagement__row +
                    " " +
                    styles["TribeWelcomeManagement__row--withHeader"]
                  }
                  key={link.id}
                >
                  <legend className={styles.TribeWelcomeManagement__legend}>
                    {buildLegend(
                      TRIBE_WELCOME_MANAGEMENT_COPY.linkLegendPrefix,
                      linkIndex,
                      links.length
                    )}
                  </legend>
                  <label
                    className={
                      styles.TribeWelcomeManagement__fieldLabel +
                      " " +
                      styles.TribeWelcomeManagement__rowLabel
                    }
                    htmlFor={linkTypeSelectId}
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
                    <div
                      className={
                        styles.TribeWelcomeManagement__field +
                        " " +
                        styles["TribeWelcomeManagement__field--full"]
                      }
                    >
                      <select
                        className={styles.TribeWelcomeManagement__select}
                        id={linkTypeSelectId}
                        onChange={(event) =>
                          updateLink(link.id, {
                            type: event.target
                              .value as TribeWelcomeLinkResult["type"],
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
                    {link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton ? (
                      <div
                        className={styles.TribeWelcomeManagement__fieldGroup}
                      >
                        <label
                          className={styles.TribeWelcomeManagement__field}
                        >
                          {renderRequiredLabel(
                            TRIBE_WELCOME_MANAGEMENT_COPY.linkPhoneLabel
                          )}
                          <Input
                            aria-describedby={
                              showPhoneError ? phoneErrorId : undefined
                            }
                            aria-invalid={showPhoneError}
                            aria-required
                            onChange={(event) =>
                              updateLink(link.id, {
                                phoneNumber: event.target.value,
                              })
                            }
                            placeholder={
                              TRIBE_WELCOME_MANAGEMENT_COPY.linkPhonePlaceholder
                            }
                            ref={buildFocusRef(link.id)}
                            value={link.phoneNumber ?? ""}
                          />
                        </label>
                        {showPhoneError ? (
                          <span
                            className={
                              styles.TribeWelcomeManagement__fieldError
                            }
                            id={phoneErrorId}
                          >
                            {isWhatsappLinkPhoneEmpty(link)
                              ? TRIBE_WELCOME_MANAGEMENT_COPY.validationWhatsappPhone
                              : TRIBE_WELCOME_MANAGEMENT_COPY.validationWhatsappPhoneInvalid}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div
                        className={styles.TribeWelcomeManagement__fieldGroup}
                      >
                        <label
                          className={styles.TribeWelcomeManagement__field}
                        >
                          {renderRequiredLabel(
                            TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlLabel
                          )}
                          <Input
                            aria-describedby={
                              showUrlError ? urlErrorId : urlHelperId
                            }
                            aria-invalid={showUrlError}
                            aria-required
                            onBlur={(event) =>
                              markUrlValidity(
                                link.id,
                                isUrlWellFormed(event.target.value)
                              )
                            }
                            onChange={(event) =>
                              updateLink(link.id, { url: event.target.value })
                            }
                            placeholder={
                              TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlPlaceholder
                            }
                            ref={buildFocusRef(link.id)}
                            value={link.url ?? ""}
                          />
                        </label>
                        {showUrlError ? (
                          <span
                            className={
                              styles.TribeWelcomeManagement__fieldError
                            }
                            id={urlErrorId}
                          >
                            {isRequiredTextMissing(link.url ?? "")
                              ? TRIBE_WELCOME_MANAGEMENT_COPY.requiredLinkUrl
                              : TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlInvalid}
                          </span>
                        ) : (
                          <span
                            className={
                              styles.TribeWelcomeManagement__fieldHelper
                            }
                            id={urlHelperId}
                          >
                            {TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlHelper}
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      className={styles.TribeWelcomeManagement__fieldGroup}
                    >
                      <label className={styles.TribeWelcomeManagement__field}>
                        {renderRequiredLabel(
                          TRIBE_WELCOME_MANAGEMENT_COPY.linkLabel
                        )}
                        <Textarea
                          aria-describedby={
                            showLinkLabelError ? linkLabelErrorId : undefined
                          }
                          aria-invalid={showLinkLabelError}
                          aria-required
                          className={styles.TribeWelcomeManagement__textarea}
                          onChange={(event) =>
                            updateLink(link.id, { label: event.target.value })
                          }
                          placeholder={
                            TRIBE_WELCOME_MANAGEMENT_COPY.linkLabelPlaceholder
                          }
                          rows={2}
                          value={link.label}
                        />
                      </label>
                      {showLinkLabelError ? (
                        <span
                          className={
                            styles.TribeWelcomeManagement__fieldError
                          }
                          id={linkLabelErrorId}
                        >
                          {TRIBE_WELCOME_MANAGEMENT_COPY.requiredLinkLabel}
                        </span>
                      ) : null}
                    </div>
                    <label className={styles.TribeWelcomeManagement__field}>
                      <span
                        className={styles.TribeWelcomeManagement__fieldLabel}
                      >
                        {TRIBE_WELCOME_MANAGEMENT_COPY.linkDescriptionLabel}
                      </span>
                      <Textarea
                        className={styles.TribeWelcomeManagement__textarea}
                        onChange={(event) =>
                          updateLink(link.id, {
                            description: event.target.value || null,
                          })
                        }
                        placeholder={
                          TRIBE_WELCOME_MANAGEMENT_COPY.linkDescriptionPlaceholder
                        }
                        rows={2}
                        value={link.description ?? ""}
                      />
                    </label>
                    <div
                      className={styles.TribeWelcomeManagement__fieldGroup}
                    >
                      <label className={styles.TribeWelcomeManagement__field}>
                        {renderRequiredLabel(
                          TRIBE_WELCOME_MANAGEMENT_COPY.badgeLabelLabel
                        )}
                        <Input
                          aria-describedby={
                            showBadgeLabelError
                              ? badgeLabelErrorId
                              : badgeLabelHelperId
                          }
                          aria-invalid={showBadgeLabelError}
                          aria-required
                          maxLength={BADGE_LABEL_MAX_LENGTH}
                          onChange={(event) =>
                            updateLink(link.id, {
                              badgeLabel: event.target.value,
                            })
                          }
                          placeholder={
                            TRIBE_WELCOME_MANAGEMENT_COPY.badgeLabelPlaceholder
                          }
                          value={link.badgeLabel}
                        />
                      </label>
                      <span
                        className={
                          styles.TribeWelcomeManagement__fieldHelper
                        }
                      >
                        {TRIBE_WELCOME_MANAGEMENT_COPY.badgeLabelHint}
                      </span>
                      {showBadgeLabelError ? (
                        <span
                          className={
                            styles.TribeWelcomeManagement__fieldError
                          }
                          id={badgeLabelErrorId}
                        >
                          {TRIBE_WELCOME_MANAGEMENT_COPY.requiredBadgeLabel}
                        </span>
                      ) : (
                        <span
                          className={
                            styles.TribeWelcomeManagement__fieldHelper
                          }
                          id={badgeLabelHelperId}
                        >
                          {TRIBE_WELCOME_MANAGEMENT_COPY.badgeLabelHelper(
                            link.badgeLabel.length,
                            BADGE_LABEL_MAX_LENGTH
                          )}
                        </span>
                      )}
                    </div>
                    {link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton ? (
                      <label
                        className={styles.TribeWelcomeManagement__field}
                      >
                        <span
                          className={
                            styles.TribeWelcomeManagement__fieldLabel
                          }
                        >
                          {TRIBE_WELCOME_MANAGEMENT_COPY.linkMessageLabel}
                        </span>
                        <Textarea
                          className={styles.TribeWelcomeManagement__textarea}
                          onChange={(event) =>
                            updateLink(link.id, {
                              message: event.target.value,
                            })
                          }
                          placeholder={
                            TRIBE_WELCOME_MANAGEMENT_COPY.linkMessagePlaceholder
                          }
                          rows={3}
                          value={link.message ?? ""}
                        />
                      </label>
                    ) : null}
                  </div>
                  <div className={styles.TribeWelcomeManagement__rowActions}>
                    <label
                      className={styles.TribeWelcomeManagement__checkLabel}
                    >
                      <Switch
                        checked={link.isActive}
                        onCheckedChange={(checked) =>
                          updateLink(link.id, { isActive: checked === true })
                        }
                      />
                      {getActiveStateLabel(link.isActive)}
                    </label>
                    <Button
                      aria-label={
                        TRIBE_WELCOME_MANAGEMENT_COPY.removeItemLabel
                      }
                      className={styles.TribeWelcomeManagement__removeButton}
                      onClick={() =>
                        setLinks((currentLinks) =>
                          currentLinks.filter(
                            (currentLink) => currentLink.id !== link.id
                          )
                        )
                      }
                      size={WELCOME_MANAGEMENT_REQUEST.iconButtonSize}
                      title={TRIBE_WELCOME_MANAGEMENT_COPY.removeLinkTitle}
                      type={WELCOME_MANAGEMENT_REQUEST.buttonType}
                      variant={WELCOME_MANAGEMENT_REQUEST.destructiveVariant}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </fieldset>
              );
            })}
          </section>

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
              onClick={() => setIsPreviewModalOpen(true)}
              type={WELCOME_MANAGEMENT_REQUEST.buttonType}
              variant={WELCOME_MANAGEMENT_REQUEST.outlineVariant}
            >
              {TRIBE_WELCOME_MANAGEMENT_COPY.previewModalButton}
            </Button>
          </div>
          <div
            aria-live={WELCOME_MANAGEMENT_ARIA.ariaLivePolite}
            className={styles.TribeWelcomeManagement__previewSurface}
          >
            <TribeWelcomeDisplay welcome={currentWelcome} />
          </div>
          {!hasActivePreviewLinks ? (
            <p className={styles.TribeWelcomeManagement__previewHint}>
              {TRIBE_WELCOME_MANAGEMENT_COPY.previewModalEmpty}
            </p>
          ) : null}
        </aside>

        {isPreviewModalOpen ? (
          <TribeWelcomeSelectionModal
            links={links}
            onClose={() => setIsPreviewModalOpen(false)}
            open
            previewOnly
            tribeSlug={tribeSlug}
          />
        ) : null}

        {validationMessage ? (
          <p
            className={styles.TribeWelcomeManagement__error}
            role={WELCOME_MANAGEMENT_ARIA.roleAlert}
          >
            {validationMessage}
          </p>
        ) : null}

        <Button
          className={styles.TribeWelcomeManagement__submit}
          disabled={isSaving}
          type={WELCOME_MANAGEMENT_REQUEST.submitButtonType}
        >
          {TRIBE_WELCOME_MANAGEMENT_COPY.saveButton}
        </Button>
      </form>
    </section>
  );
}
