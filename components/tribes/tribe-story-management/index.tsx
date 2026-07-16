"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RichTextContent } from "@/components/rich-text/rich-text-content";
import { TRIBE_STORY_CONTENT_MAX_LENGTH } from "@/src/modules/tribes/constants/tribe-story";
import type { TribeStoryResult } from "@/src/modules/tribes/application/results/tribe-story-result";
import styles from "./styles.module.scss";

const TRIBE_STORY_MANAGEMENT_COPY = {
  contentCounter: (current: number, max: number) => `${current}/${max}`,
  contentHint:
    "Contá de dónde viene la tribu, qué la mueve y hacia dónde va. Los miembros la van a ver en esta página. Podés agregar links con el formato [texto](https://...).",
  contentLabel: "Historia de la tribu",
  contentPlaceholder:
    "Ej.: Nacimos en 2020 como un grupo de amigos que quería aprender a invertir...",
  editDescription:
    "Definí la historia que ven los miembros de la tribu. Solo el líder puede editarla.",
  emptyState: "El líder todavía no escribió la historia de la tribu.",
  fallbackSaveError: "No pudimos guardar la historia.",
  previewEyebrow: "Vista previa",
  requiredContent: "Escribí la historia antes de guardar.",
  saveButton: "Guardar",
  saveSuccess: "Historia actualizada.",
  savingButton: "Guardando...",
  title: "Historia",
} as const;

const STORY_MANAGEMENT_ROUTE = {
  apiPrefix: "/api/tribes/",
  storySegment: "/story",
} as const;

const STORY_MANAGEMENT_REQUEST = {
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  putMethod: "PUT",
  submitButtonType: "submit",
} as const;

const STORY_MANAGEMENT_ARIA = {
  roleAlert: "alert",
} as const;

const STORY_TEXTAREA_ROWS = 12;

type TribeStoryManagementProps = {
  canEdit: boolean;
  story: TribeStoryResult | null;
  tribeSlug: string;
};

function buildStoryEndpoint(tribeSlug: string): string {
  return (
    STORY_MANAGEMENT_ROUTE.apiPrefix +
    tribeSlug +
    STORY_MANAGEMENT_ROUTE.storySegment
  );
}

async function submitStoryUpdate(
  tribeSlug: string,
  content: string
): Promise<string> {
  const response = await fetch(buildStoryEndpoint(tribeSlug), {
    body: JSON.stringify({ content }),
    headers: {
      [STORY_MANAGEMENT_REQUEST.contentTypeHeader]:
        STORY_MANAGEMENT_REQUEST.jsonContentType,
    },
    method: STORY_MANAGEMENT_REQUEST.putMethod,
  });
  const responseBody = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? TRIBE_STORY_MANAGEMENT_COPY.fallbackSaveError
    );
  }

  return responseBody.message ?? TRIBE_STORY_MANAGEMENT_COPY.saveSuccess;
}

function TribeStoryDisplay({ story }: { story: TribeStoryResult | null }) {
  return (
    <section className={styles.TribeStoryManagement}>
      <header className={styles.TribeStoryManagement__header}>
        <h1 className={styles.TribeStoryManagement__title}>
          {TRIBE_STORY_MANAGEMENT_COPY.title}
        </h1>
      </header>
      {story ? (
        <p className={styles.TribeStoryManagement__content}>
          <RichTextContent content={story.content} />
        </p>
      ) : (
        <p className={styles.TribeStoryManagement__emptyState}>
          {TRIBE_STORY_MANAGEMENT_COPY.emptyState}
        </p>
      )}
    </section>
  );
}

export function TribeStoryManagement({
  canEdit,
  story,
  tribeSlug,
}: TribeStoryManagementProps) {
  const [content, setContent] = useState(story?.content ?? "");
  const [savedContent, setSavedContent] = useState(story?.content ?? "");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const contentId = useId();
  const contentErrorId = useId();
  const trimmedContent = content.trim();
  const isDirty = trimmedContent !== savedContent.trim();
  const showContentError = validationMessage !== null;

  if (!canEdit) {
    return <TribeStoryDisplay story={story} />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!trimmedContent) {
      setValidationMessage(TRIBE_STORY_MANAGEMENT_COPY.requiredContent);
      return;
    }

    setIsSaving(true);
    setValidationMessage(null);

    try {
      const message = await submitStoryUpdate(tribeSlug, trimmedContent);

      setSavedContent(trimmedContent);
      toast.success(message);
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : TRIBE_STORY_MANAGEMENT_COPY.fallbackSaveError
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={styles.TribeStoryManagement}>
      <header className={styles.TribeStoryManagement__header}>
        <h1 className={styles.TribeStoryManagement__title}>
          {TRIBE_STORY_MANAGEMENT_COPY.title}
        </h1>
        <p className={styles.TribeStoryManagement__description}>
          {TRIBE_STORY_MANAGEMENT_COPY.editDescription}
        </p>
      </header>

      <form
        className={styles.TribeStoryManagement__form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className={styles.TribeStoryManagement__field}>
          <label
            className={styles.TribeStoryManagement__fieldLabel}
            htmlFor={contentId}
          >
            {TRIBE_STORY_MANAGEMENT_COPY.contentLabel}
          </label>
          <span className={styles.TribeStoryManagement__fieldHelper}>
            {TRIBE_STORY_MANAGEMENT_COPY.contentHint}
          </span>
          <Textarea
            aria-describedby={showContentError ? contentErrorId : undefined}
            aria-invalid={showContentError}
            aria-required
            className={styles.TribeStoryManagement__textarea}
            id={contentId}
            maxLength={TRIBE_STORY_CONTENT_MAX_LENGTH}
            onChange={(event) => {
              setContent(event.target.value);
              setValidationMessage(null);
            }}
            placeholder={TRIBE_STORY_MANAGEMENT_COPY.contentPlaceholder}
            rows={STORY_TEXTAREA_ROWS}
            value={content}
          />
          <span className={styles.TribeStoryManagement__counter}>
            {TRIBE_STORY_MANAGEMENT_COPY.contentCounter(
              content.length,
              TRIBE_STORY_CONTENT_MAX_LENGTH
            )}
          </span>
          {showContentError ? (
            <span
              className={styles.TribeStoryManagement__fieldError}
              id={contentErrorId}
              role={STORY_MANAGEMENT_ARIA.roleAlert}
            >
              {validationMessage}
            </span>
          ) : null}
        </div>

        <div className={styles.TribeStoryManagement__actions}>
          <Button
            disabled={isSaving || !isDirty}
            type={STORY_MANAGEMENT_REQUEST.submitButtonType}
          >
            {isSaving
              ? TRIBE_STORY_MANAGEMENT_COPY.savingButton
              : TRIBE_STORY_MANAGEMENT_COPY.saveButton}
          </Button>
        </div>
      </form>

      {trimmedContent ? (
        <section className={styles.TribeStoryManagement__preview}>
          <span className={styles.TribeStoryManagement__previewEyebrow}>
            {TRIBE_STORY_MANAGEMENT_COPY.previewEyebrow}
          </span>
          <p className={styles.TribeStoryManagement__content}>
            <RichTextContent content={trimmedContent} />
          </p>
        </section>
      ) : null}
    </section>
  );
}
