"use client";

import { FormEvent, useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CommunityPostCategoryResult } from "@/src/modules/posts/application/results/community-feed-result";
import styles from "./styles.module.scss";

const CATEGORY_MANAGEMENT_COPY = {
  actionsLabelPrefix: "Acciones de",
  createButton: "Crear categoría",
  createSectionTitle: "Nueva categoría",
  deleteButton: "Eliminar",
  emojiLabel: "Ícono",
  emptyState: "Todavía no hay categorías configuradas.",
  fallbackCreateError: "No pudimos crear la categoría.",
  fallbackDeleteError: "No pudimos eliminar la categoría.",
  fallbackSaveError: "No pudimos guardar la categoría.",
  fallbackUpdateError: "No pudimos actualizar la categoría.",
  nameLabel: "Nombre",
  namePlaceholder: "Nombre de la categoría",
  selectTargetPlaceholder: "Seleccionar destino",
  saveButton: "Guardar",
  sectionDescription:
    "Organizá el feed en categorías. Si una categoría tiene publicaciones, se moverán antes de eliminarla.",
  sectionTitle: "Categorías",
  configuredSectionTitle: "Categorías configuradas",
  targetLabel: "Mover publicaciones a",
} as const;

const CATEGORY_MANAGEMENT_ROUTE = {
  apiCommunities: "/api/communities/",
  postCategoriesSegment: "/post-categories",
  segmentSeparator: "/",
} as const;

const CATEGORY_MANAGEMENT_ENDPOINT = {
  categories: (communitySlug: string) =>
    CATEGORY_MANAGEMENT_ROUTE.apiCommunities +
    communitySlug +
    CATEGORY_MANAGEMENT_ROUTE.postCategoriesSegment,
  category: (communitySlug: string, categoryId: string) =>
    CATEGORY_MANAGEMENT_ROUTE.apiCommunities +
    communitySlug +
    CATEGORY_MANAGEMENT_ROUTE.postCategoriesSegment +
    CATEGORY_MANAGEMENT_ROUTE.segmentSeparator +
    categoryId,
} as const;

const CATEGORY_MANAGEMENT_FORM = {
  contentTypeHeader: "Content-Type",
  deleteMethod: "DELETE",
  groupRole: "group",
  jsonContentType: "application/json",
  patchMethod: "PATCH",
  postMethod: "POST",
  submitType: "submit",
  buttonType: "button",
  emptySelectValue: "",
  outlineVariant: "outline",
} as const;

type PostCategoryManagementProps = {
  categories: CommunityPostCategoryResult[];
  communitySlug: string;
};

type CategoryResponse = {
  category?: CommunityPostCategoryResult;
  message?: string;
};

async function submitCategoryRequest(
  url: string,
  method: string,
  body?: Record<string, string | number>
): Promise<CategoryResponse> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      [CATEGORY_MANAGEMENT_FORM.contentTypeHeader]:
        CATEGORY_MANAGEMENT_FORM.jsonContentType,
    },
    method,
  });
  const responseBody = (await response.json().catch(() => ({}))) as CategoryResponse;

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? CATEGORY_MANAGEMENT_COPY.fallbackSaveError
    );
  }

  return responseBody;
}

export function PostCategoryManagement({
  categories,
  communitySlug,
}: PostCategoryManagementProps) {
  const [categoryItems, setCategoryItems] = useState(categories);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [targetCategoryById, setTargetCategoryById] = useState<Record<string, string>>(
    {}
  );
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);

  const handleCreateCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingCategoryId(CATEGORY_MANAGEMENT_COPY.createButton);

    try {
      const response = await submitCategoryRequest(
        CATEGORY_MANAGEMENT_ENDPOINT.categories(communitySlug),
        CATEGORY_MANAGEMENT_FORM.postMethod,
        {
          emoji,
          name,
        }
      );

      if (response.category) {
        setCategoryItems((currentItems) => [...currentItems, response.category!]);
      }

      setEmoji("");
      setName("");
      toast.success(response.message ?? CATEGORY_MANAGEMENT_COPY.createButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : CATEGORY_MANAGEMENT_COPY.fallbackCreateError
      );
    } finally {
      setPendingCategoryId(null);
    }
  };

  const handleUpdateCategory = async (category: CommunityPostCategoryResult) => {
    setPendingCategoryId(category.id);

    try {
      const response = await submitCategoryRequest(
        CATEGORY_MANAGEMENT_ENDPOINT.category(communitySlug, category.id),
        CATEGORY_MANAGEMENT_FORM.patchMethod,
        {
          emoji: category.emoji,
          name: category.name,
          sortOrder: category.sortOrder,
        }
      );

      if (response.category) {
        setCategoryItems((currentItems) =>
          currentItems.map((currentCategory) =>
            currentCategory.id === response.category!.id
              ? response.category!
              : currentCategory
          )
        );
      }

      toast.success(response.message ?? CATEGORY_MANAGEMENT_COPY.saveButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : CATEGORY_MANAGEMENT_COPY.fallbackUpdateError
      );
    } finally {
      setPendingCategoryId(null);
    }
  };

  const handleDeleteCategory = async (category: CommunityPostCategoryResult) => {
    const targetCategoryId = targetCategoryById[category.id] ?? "";

    setPendingCategoryId(category.id);

    try {
      const response = await submitCategoryRequest(
        CATEGORY_MANAGEMENT_ENDPOINT.category(communitySlug, category.id),
        CATEGORY_MANAGEMENT_FORM.deleteMethod,
        targetCategoryId ? { targetCategoryId } : undefined
      );

      setCategoryItems((currentItems) =>
        currentItems.filter((currentCategory) => currentCategory.id !== category.id)
      );
      setTargetCategoryById((currentTargets) => {
        const nextTargets: Record<string, string> = {};

        for (const [sourceCategoryId, targetCategoryId] of Object.entries(
          currentTargets
        )) {
          if (
            sourceCategoryId === category.id ||
            targetCategoryId === category.id
          ) {
            continue;
          }

          nextTargets[sourceCategoryId] = targetCategoryId;
        }

        return nextTargets;
      });
      toast.success(response.message ?? CATEGORY_MANAGEMENT_COPY.deleteButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : CATEGORY_MANAGEMENT_COPY.fallbackDeleteError
      );
    } finally {
      setPendingCategoryId(null);
    }
  };

  return (
    <section className={styles.PostCategoryManagement}>
      <header className={styles.PostCategoryManagement__header}>
        <h1 className={styles.PostCategoryManagement__title}>
          {CATEGORY_MANAGEMENT_COPY.sectionTitle}
        </h1>
        <p className={styles.PostCategoryManagement__description}>
          {CATEGORY_MANAGEMENT_COPY.sectionDescription}
        </p>
      </header>

      <section className={styles.PostCategoryManagement__createSection}>
        <h2 className={styles.PostCategoryManagement__sectionTitle}>
          {CATEGORY_MANAGEMENT_COPY.createSectionTitle}
        </h2>
        <form
          className={styles.PostCategoryManagement__createForm}
          onSubmit={handleCreateCategory}
        >
          <label className={styles.PostCategoryManagement__field}>
            <span className={styles.PostCategoryManagement__fieldLabel}>
              {CATEGORY_MANAGEMENT_COPY.emojiLabel}
            </span>
            <Input
              className={styles.PostCategoryManagement__emojiInput}
              onChange={(event) => {
                setEmoji(event.currentTarget.value);
              }}
              value={emoji}
            />
          </label>
          <label className={styles.PostCategoryManagement__field}>
            <span className={styles.PostCategoryManagement__fieldLabel}>
              {CATEGORY_MANAGEMENT_COPY.nameLabel}
            </span>
            <Input
              className={styles.PostCategoryManagement__textInput}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              placeholder={CATEGORY_MANAGEMENT_COPY.namePlaceholder}
              value={name}
            />
          </label>
          <Button
            className={styles.PostCategoryManagement__createButton}
            disabled={Boolean(pendingCategoryId) || !name.trim() || !emoji.trim()}
            type={CATEGORY_MANAGEMENT_FORM.submitType}
          >
            <PlusIcon />
            {CATEGORY_MANAGEMENT_COPY.createButton}
          </Button>
        </form>
      </section>

      <section className={styles.PostCategoryManagement__configuredSection}>
        <h2 className={styles.PostCategoryManagement__sectionTitle}>
          {CATEGORY_MANAGEMENT_COPY.configuredSectionTitle}
        </h2>
        {categoryItems.length === 0 ? (
          <p className={styles.PostCategoryManagement__empty}>
            {CATEGORY_MANAGEMENT_COPY.emptyState}
          </p>
        ) : (
          <ol
            aria-label="Categorías configuradas"
            className={styles.PostCategoryManagement__list}
          >
            {categoryItems.map((category) => (
              <li className={styles.PostCategoryManagement__item} key={category.id}>
                <label className={styles.PostCategoryManagement__field}>
                  <span className={styles.PostCategoryManagement__fieldLabel}>
                    {CATEGORY_MANAGEMENT_COPY.emojiLabel}
                  </span>
                  <Input
                    className={styles.PostCategoryManagement__emojiInput}
                    disabled={pendingCategoryId === category.id}
                    onChange={(event) => {
                      const nextEmoji = event.currentTarget.value;

                      setCategoryItems((currentItems) =>
                        currentItems.map((currentCategory) =>
                          currentCategory.id === category.id
                            ? { ...currentCategory, emoji: nextEmoji }
                            : currentCategory
                        )
                      );
                    }}
                    value={category.emoji}
                  />
                </label>
                <label className={styles.PostCategoryManagement__field}>
                  <span className={styles.PostCategoryManagement__fieldLabel}>
                    {CATEGORY_MANAGEMENT_COPY.nameLabel}
                  </span>
                  <Input
                    className={styles.PostCategoryManagement__textInput}
                    disabled={pendingCategoryId === category.id}
                    onChange={(event) => {
                      const nextName = event.currentTarget.value;

                      setCategoryItems((currentItems) =>
                        currentItems.map((currentCategory) =>
                          currentCategory.id === category.id
                            ? { ...currentCategory, name: nextName }
                            : currentCategory
                        )
                      );
                    }}
                    value={category.name}
                  />
                </label>
                <label
                  className={`${styles.PostCategoryManagement__field} ${styles.PostCategoryManagement__targetField}`}
                >
                  <span className={styles.PostCategoryManagement__fieldLabel}>
                    {CATEGORY_MANAGEMENT_COPY.targetLabel}
                  </span>
                  <select
                    className={styles.PostCategoryManagement__select}
                    disabled={pendingCategoryId === category.id}
                    onChange={(event) => {
                      const selectedTargetCategoryId = event.currentTarget.value;

                      setTargetCategoryById((currentTargets) => ({
                        ...currentTargets,
                        [category.id]: selectedTargetCategoryId,
                      }));
                    }}
                    value={targetCategoryById[category.id] ?? ""}
                  >
                    <option value={CATEGORY_MANAGEMENT_FORM.emptySelectValue}>
                      {CATEGORY_MANAGEMENT_COPY.selectTargetPlaceholder}
                    </option>
                    {categoryItems
                      .filter((targetCategory) => targetCategory.id !== category.id)
                      .map((targetCategory) => (
                        <option key={targetCategory.id} value={targetCategory.id}>
                          {targetCategory.emoji} {targetCategory.name}
                        </option>
                    ))}
                  </select>
                </label>
                <div
                  aria-label={`${CATEGORY_MANAGEMENT_COPY.actionsLabelPrefix} ${category.name}`}
                  className={styles.PostCategoryManagement__actions}
                  role={CATEGORY_MANAGEMENT_FORM.groupRole}
                >
                  <Button
                    className={styles.PostCategoryManagement__actionButton}
                    disabled={pendingCategoryId === category.id}
                    onClick={() => {
                      void handleUpdateCategory(category);
                    }}
                    type={CATEGORY_MANAGEMENT_FORM.buttonType}
                    variant={CATEGORY_MANAGEMENT_FORM.outlineVariant}
                  >
                    <PencilIcon />
                    {CATEGORY_MANAGEMENT_COPY.saveButton}
                  </Button>
                  <Button
                    className={styles.PostCategoryManagement__actionButton}
                    disabled={pendingCategoryId === category.id}
                    onClick={() => {
                      void handleDeleteCategory(category);
                    }}
                    type={CATEGORY_MANAGEMENT_FORM.buttonType}
                    variant={CATEGORY_MANAGEMENT_FORM.outlineVariant}
                  >
                    <Trash2Icon />
                    {CATEGORY_MANAGEMENT_COPY.deleteButton}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
