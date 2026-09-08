"use client";

import { useId, useState } from "react";
import { CheckCircle2Icon, PencilLineIcon } from "lucide-react";

import { Button, Input } from "beez-ui";

import { normalizeTribeSlug } from "@/src/modules/tribes/domain/value-objects/tribe-slug";
import styles from "./styles.module.scss";

const TRIBE_SLUG_NORMALIZATION_FORM = "NFD";
const TRIBE_SLUG_PREVIEW_FALLBACK = "tu-tribu";
const TRIBE_SLUG_TRAILING_SEPARATOR = "-";
const CREATE_TRIBE_FORM_ARIA = {
  livePolite: "polite",
} as const;
const CREATE_TRIBE_FORM_BUTTON = {
  outlineVariant: "outline",
  smallSize: "sm",
  submitType: "submit",
} as const;
const CREATE_TRIBE_FORM_FIELD = {
  hiddenType: "hidden",
  method: "post",
  name: "name",
  slug: "slug",
} as const;
const CREATE_TRIBE_FORM_INTERACTION = {
  buttonType: "button",
} as const;

type CreateTribeFormProps = {
  errorMessage?: string | null;
  initialName?: string;
  initialSlug?: string;
  submitPath: string;
  suggestedSlug?: string | null;
};

function normalizeTribeSlugDraft(input: string): string {
  const normalizedSlug = normalizeTribeSlug(input);
  const hasTrailingSeparator = /[^a-z0-9]+$/i.test(
    input.normalize(TRIBE_SLUG_NORMALIZATION_FORM).replace(/[\u0300-\u036f]/g, "")
  );

  if (hasTrailingSeparator && normalizedSlug.length > 0) {
    return normalizedSlug + TRIBE_SLUG_TRAILING_SEPARATOR;
  }

  return normalizedSlug;
}

export function CreateTribeForm({
  errorMessage = null,
  initialName = "",
  initialSlug = "",
  submitPath,
  suggestedSlug = null,
}: CreateTribeFormProps) {
  const nameInputId = useId();
  const slugInputId = useId();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const normalizedInitialNameSlug = normalizeTribeSlug(initialName);
  const normalizedInitialSlug = normalizeTribeSlug(initialSlug);
  const [hasManualSlugChanges, setHasManualSlugChanges] = useState(
    normalizedInitialSlug.length > 0 &&
      normalizedInitialSlug !== normalizedInitialNameSlug
  );
  const normalizedNameSlug = normalizeTribeSlug(name);
  const canonicalSlug = normalizeTribeSlug(slug);
  const isSlugSynced =
    Boolean(normalizedNameSlug) && canonicalSlug === normalizedNameSlug;

  const slugPreview =
    canonicalSlug || normalizedNameSlug || TRIBE_SLUG_PREVIEW_FALLBACK;

  return (
    <form
      action={submitPath}
      className={styles.CreateTribeForm}
      method={CREATE_TRIBE_FORM_FIELD.method}
    >
      <input
        name={CREATE_TRIBE_FORM_FIELD.slug}
        type={CREATE_TRIBE_FORM_FIELD.hiddenType}
        value={canonicalSlug}
        readOnly
      />
      <div className={styles.CreateTribeForm__field}>
        <label
          className={styles.CreateTribeForm__label}
          htmlFor={nameInputId}
        >
          Nombre de la tribu
        </label>
        <Input
          id={nameInputId}
          name={CREATE_TRIBE_FORM_FIELD.name}
          onChange={(event) => {
            const nextName = event.currentTarget.value;
            setName(nextName);

            if (!hasManualSlugChanges) {
              setSlug(normalizeTribeSlug(nextName));
            }
          }}
          placeholder="Ej. Creadoras que construyen futuro"
          required
          value={name}
        />
      </div>

      <div className={styles.CreateTribeForm__field}>
        <div className={styles.CreateTribeForm__labelRow}>
          <label
            className={styles.CreateTribeForm__label}
            htmlFor={slugInputId}
          >
            Slug
          </label>
          <Button
            className={styles.CreateTribeForm__syncButton}
            disabled={!normalizedNameSlug}
            onClick={() => {
              setHasManualSlugChanges(false);
              setSlug(normalizedNameSlug);
            }}
            size={CREATE_TRIBE_FORM_BUTTON.smallSize}
            type={CREATE_TRIBE_FORM_INTERACTION.buttonType}
            variant={CREATE_TRIBE_FORM_BUTTON.outlineVariant}
          >
            Sincronizar con el nombre
          </Button>
        </div>
        <div className={styles.CreateTribeForm__slugInputWrap}>
          <Input
            className={`${styles.CreateTribeForm__slugInput} ${
              isSlugSynced
                ? styles["CreateTribeForm__slugInput--synced"]
                : styles["CreateTribeForm__slugInput--unsynced"]
            }`}
            id={slugInputId}
            onBlur={(event) => {
              setSlug(normalizeTribeSlug(event.currentTarget.value));
            }}
            onChange={(event) => {
              setHasManualSlugChanges(true);
              setSlug(normalizeTribeSlugDraft(event.currentTarget.value));
            }}
            placeholder="creadoras-que-construyen-futuro"
            required
            value={slug}
          />
          {normalizedNameSlug ? (
            <span
              aria-live={CREATE_TRIBE_FORM_ARIA.livePolite}
              className={`${styles.CreateTribeForm__statusInline} ${
                isSlugSynced
                  ? styles["CreateTribeForm__statusInline--synced"]
                  : styles["CreateTribeForm__statusInline--unsynced"]
              }`}
            >
              {isSlugSynced ? <CheckCircle2Icon /> : <PencilLineIcon />}
              <span>{isSlugSynced ? "Sincronizado" : "Editado"}</span>
            </span>
          ) : null}
        </div>
        <p className={styles.CreateTribeForm__hint}>
          Tu tribu quedara en <strong>/{slugPreview}</strong>
        </p>
      </div>

      {errorMessage ? (
        <div
          aria-live={CREATE_TRIBE_FORM_ARIA.livePolite}
          className={styles.CreateTribeForm__feedback}
        >
          <p className={styles.CreateTribeForm__error}>{errorMessage}</p>

          {suggestedSlug ? (
            <Button
              onClick={() => {
                setHasManualSlugChanges(true);
                setSlug(suggestedSlug);
              }}
              type={CREATE_TRIBE_FORM_INTERACTION.buttonType}
              variant={CREATE_TRIBE_FORM_BUTTON.outlineVariant}
            >
              Usar sugerencia
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.CreateTribeForm__actions}>
        <Button type={CREATE_TRIBE_FORM_BUTTON.submitType}>
          Crear tribu
        </Button>
      </div>
    </form>
  );
}
