"use client";

import { useId, useState } from "react";
import { CheckCircle2Icon, PencilLineIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCommunitySlug } from "@/src/modules/communities/domain/value-objects/community-slug";
import styles from "./styles.module.scss";

type CreateCommunityFormProps = {
  errorMessage?: string | null;
  initialName?: string;
  initialSlug?: string;
  submitPath: string;
  suggestedSlug?: string | null;
};

function normalizeCommunitySlugDraft(input: string): string {
  const normalizedSlug = normalizeCommunitySlug(input);
  const hasTrailingSeparator = /[^a-z0-9]+$/i.test(
    input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );

  if (hasTrailingSeparator && normalizedSlug.length > 0) {
    return `${normalizedSlug}-`;
  }

  return normalizedSlug;
}

export function CreateCommunityForm({
  errorMessage = null,
  initialName = "",
  initialSlug = "",
  submitPath,
  suggestedSlug = null,
}: CreateCommunityFormProps) {
  const nameInputId = useId();
  const slugInputId = useId();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [hasManualSlugChanges, setHasManualSlugChanges] = useState(
    initialSlug.trim().length > 0
  );
  const normalizedNameSlug = normalizeCommunitySlug(name);
  const canonicalSlug = normalizeCommunitySlug(slug);
  const isSlugSynced =
    Boolean(normalizedNameSlug) && canonicalSlug === normalizedNameSlug;

  const slugPreview = canonicalSlug || normalizedNameSlug || "tu-comunidad";

  return (
    <form
      action={submitPath}
      className={styles.CreateCommunityForm}
      method="post"
    >
      <input name="slug" type="hidden" value={canonicalSlug} />
      <div className={styles.CreateCommunityForm__field}>
        <label
          className={styles.CreateCommunityForm__label}
          htmlFor={nameInputId}
        >
          Nombre de la comunidad
        </label>
        <Input
          id={nameInputId}
          name="name"
          onChange={(event) => {
            const nextName = event.currentTarget.value;
            setName(nextName);

            if (!hasManualSlugChanges) {
              setSlug(normalizeCommunitySlug(nextName));
            }
          }}
          placeholder="Ej. Creadoras que construyen futuro"
          required
          value={name}
        />
      </div>

      <div className={styles.CreateCommunityForm__field}>
        <div className={styles.CreateCommunityForm__labelRow}>
          <label
            className={styles.CreateCommunityForm__label}
            htmlFor={slugInputId}
          >
            Slug
          </label>
          <Button
            className={styles.CreateCommunityForm__syncButton}
            disabled={!normalizedNameSlug}
            onClick={() => {
              setHasManualSlugChanges(false);
              setSlug(normalizedNameSlug);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Sincronizar con el nombre
          </Button>
        </div>
        <div className={styles.CreateCommunityForm__slugInputWrap}>
          <Input
            className={`${styles.CreateCommunityForm__slugInput} ${
              isSlugSynced
                ? styles["CreateCommunityForm__slugInput--synced"]
                : styles["CreateCommunityForm__slugInput--unsynced"]
            }`}
            id={slugInputId}
            onBlur={(event) => {
              setSlug(normalizeCommunitySlug(event.currentTarget.value));
            }}
            onChange={(event) => {
              setHasManualSlugChanges(true);
              setSlug(normalizeCommunitySlugDraft(event.currentTarget.value));
            }}
            placeholder="creadoras-que-construyen-futuro"
            required
            value={slug}
          />
          {normalizedNameSlug ? (
            <span
              aria-live="polite"
              className={`${styles.CreateCommunityForm__statusInline} ${
                isSlugSynced
                  ? styles["CreateCommunityForm__statusInline--synced"]
                  : styles["CreateCommunityForm__statusInline--unsynced"]
              }`}
            >
              {isSlugSynced ? <CheckCircle2Icon /> : <PencilLineIcon />}
              <span>{isSlugSynced ? "Sincronizado" : "Editado"}</span>
            </span>
          ) : null}
        </div>
        <p className={styles.CreateCommunityForm__hint}>
          Tu comunidad quedara en <strong>/comunidad/{slugPreview}</strong>
        </p>
      </div>

      {errorMessage ? (
        <div
          aria-live="polite"
          className={styles.CreateCommunityForm__feedback}
        >
          <p className={styles.CreateCommunityForm__error}>{errorMessage}</p>

          {suggestedSlug ? (
            <Button
              onClick={() => {
                setHasManualSlugChanges(true);
                setSlug(suggestedSlug);
              }}
              type="button"
              variant="outline"
            >
              Usar sugerencia
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.CreateCommunityForm__actions}>
        <Button type="submit">Crear comunidad</Button>
      </div>
    </form>
  );
}
