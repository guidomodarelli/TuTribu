"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2Icon, PencilLineIcon } from "lucide-react";

import { Button, Input } from "beez-ui";

import { AnimatedCollapse } from "@/components/motion/animated-collapse";
import { PresenceSwap } from "@/components/motion/presence-swap";
import { joinClassNames } from "@/lib/motion/join-class-names";
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

/** Presence keys for the synced/edited slug status pill. */
const SLUG_STATUS_KEY = {
  edited: "edited",
  synced: "synced",
} as const;

/** Browser event fired when a page is shown, including restores from the back-forward cache. */
const PAGE_SHOW_EVENT = "pageshow";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFeedbackDismissed, setIsFeedbackDismissed] = useState(false);
  const feedbackId = useId();
  const slugInputRef = useRef<HTMLInputElement>(null);
  // Synchronous guard: the native POST navigates away, so a second activation
  // before the button re-renders as disabled would create the tribe twice.
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    // A back navigation can restore this page from the bfcache with the
    // button still disabled; re-enable it so the form stays usable.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    };

    window.addEventListener(PAGE_SHOW_EVENT, handlePageShow);

    return () => {
      window.removeEventListener(PAGE_SHOW_EVENT, handlePageShow);
    };
  }, []);
  const normalizedNameSlug = normalizeTribeSlug(name);
  const canonicalSlug = normalizeTribeSlug(slug);
  const isSlugSynced =
    Boolean(normalizedNameSlug) && canonicalSlug === normalizedNameSlug;

  const slugPreview =
    canonicalSlug || normalizedNameSlug || TRIBE_SLUG_PREVIEW_FALLBACK;
  const isFeedbackVisible = Boolean(errorMessage) && !isFeedbackDismissed;

  return (
    <form
      action={submitPath}
      aria-busy={isSubmitting || undefined}
      className={styles.CreateTribeForm}
      method={CREATE_TRIBE_FORM_FIELD.method}
      onSubmit={(event) => {
        if (isSubmittingRef.current) {
          event.preventDefault();
          return;
        }

        isSubmittingRef.current = true;
        setIsSubmitting(true);
      }}
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
            disabled={!normalizedNameSlug || isSlugSynced}
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
            aria-describedby={isFeedbackVisible ? feedbackId : undefined}
            className={joinClassNames(
              styles.CreateTribeForm__slugInput,
              normalizedNameSlug &&
                (isSlugSynced
                  ? styles["CreateTribeForm__slugInput--synced"]
                  : styles["CreateTribeForm__slugInput--unsynced"])
            )}
            id={slugInputId}
            onBlur={(event) => {
              setSlug(normalizeTribeSlug(event.currentTarget.value));
            }}
            onChange={(event) => {
              setHasManualSlugChanges(true);
              setSlug(normalizeTribeSlugDraft(event.currentTarget.value));
            }}
            placeholder="creadoras-que-construyen-futuro"
            ref={slugInputRef}
            required
            value={slug}
          />
          {normalizedNameSlug ? (
            <span
              aria-live={CREATE_TRIBE_FORM_ARIA.livePolite}
              className={joinClassNames(
                styles.CreateTribeForm__statusInline,
                isSlugSynced
                  ? styles["CreateTribeForm__statusInline--synced"]
                  : styles["CreateTribeForm__statusInline--unsynced"]
              )}
            >
              <PresenceSwap
                as="span"
                className={styles.CreateTribeForm__statusContent}
                mode="popLayout"
                presenceKey={
                  isSlugSynced ? SLUG_STATUS_KEY.synced : SLUG_STATUS_KEY.edited
                }
              >
                {isSlugSynced ? (
                  <CheckCircle2Icon aria-hidden />
                ) : (
                  <PencilLineIcon aria-hidden />
                )}
                <span>{isSlugSynced ? "Sincronizado" : "Editado"}</span>
              </PresenceSwap>
            </span>
          ) : null}
        </div>
        <p className={styles.CreateTribeForm__hint}>
          Tu tribu quedará en <strong>/{slugPreview}</strong>
        </p>
      </div>

      <AnimatedCollapse isOpen={isFeedbackVisible}>
        <div
          aria-live={CREATE_TRIBE_FORM_ARIA.livePolite}
          className={styles.CreateTribeForm__feedback}
          id={feedbackId}
        >
          <p className={styles.CreateTribeForm__error}>{errorMessage}</p>

          {suggestedSlug ? (
            <Button
              onClick={() => {
                setHasManualSlugChanges(true);
                setSlug(suggestedSlug);
                // The conflict is resolved: hide it and keep focus on the fixed field.
                setIsFeedbackDismissed(true);
                slugInputRef.current?.focus();
              }}
              type={CREATE_TRIBE_FORM_INTERACTION.buttonType}
              variant={CREATE_TRIBE_FORM_BUTTON.outlineVariant}
            >
              Usar sugerencia
            </Button>
          ) : null}
        </div>
      </AnimatedCollapse>

      <div className={styles.CreateTribeForm__actions}>
        <Button
          aria-busy={isSubmitting || undefined}
          disabled={isSubmitting}
          type={CREATE_TRIBE_FORM_BUTTON.submitType}
        >
          {isSubmitting ? "Creando tribu…" : "Crear tribu"}
        </Button>
      </div>
    </form>
  );
}
