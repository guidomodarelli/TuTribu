"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { Button, Popover, PopoverContent, PopoverTrigger } from "beez-ui";

import {
  RICH_LINK_POPOVER_MODE,
  RICH_TEXT_EDITOR_KEY,
  RICH_TEXT_SEGMENT_TYPE,
} from "@/lib/rich-text/link-markdown-constants";
import type { RichLinkEditorController } from "./use-rich-link-editor";
import styles from "./styles.module.scss";

const BUTTON_TYPE = "button";
const BUTTON_VARIANT = {
  ghost: "ghost",
  outline: "outline",
} as const;
const URL_INPUT_TYPE = "url";
const LINK_TARGET = "_blank";
const LINK_REL = "noreferrer";

/** Spanish copy for the link popover, injected by each consuming feature. */
export type RichLinkEditorCopy = {
  editAction: string;
  editCancel: string;
  editSave: string;
  popoverTextLabel: string;
  popoverUrlLabel: string;
  removeAction: string;
};

type RichLinkEditorProps = {
  ariaLabel: string;
  copy: RichLinkEditorCopy;
  editor: RichLinkEditorController;
  placeholder: string;
  ariaDescribedBy?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
};

/**
 * `contentEditable` rich link editor: renders the controller's preview segments,
 * turning each link into a popover that edits or removes it. All state lives in
 * the `useRichLinkEditor` controller; this component is presentation only.
 */
export function RichLinkEditor({
  ariaDescribedBy,
  ariaLabel,
  copy,
  editor,
  isDisabled = false,
  isInvalid = false,
  placeholder,
}: RichLinkEditorProps) {
  const {
    activeLink,
    closeLinkPopover,
    handleBeforeInput,
    handleInput,
    handleKeyDown,
    handlePaste,
    hasContent,
    hasInvalidLinkUrl,
    isLinkEditValid,
    linkTextInput,
    linkUrlInput,
    openLinkPopover,
    popoverMode,
    removeLink,
    saveLinkEdit,
    segments,
    setEditorElement,
    setLinkTextInput,
    setLinkUrlInput,
    setPopoverMode,
  } = editor;
  const linkTextInputRef = useRef<HTMLInputElement | null>(null);
  const isEditingLink = popoverMode === RICH_LINK_POPOVER_MODE.edit;
  const editorClassName = isInvalid
    ? `${styles.RichLinkEditor__editor} ${styles["RichLinkEditor__editor--invalid"]}`
    : styles.RichLinkEditor__editor;

  // Dismiss any open link popover the moment the editor locks, so a pending
  // submit/edit request can never leave editable controls active over a draft
  // the user can no longer change.
  useEffect(() => {
    if (isDisabled) {
      closeLinkPopover();
    }
  }, [closeLinkPopover, isDisabled]);

  // Switching from the actions to the edit form unmounts the focused "Editar"
  // button; move focus into the form so keyboard users land on the first field
  // instead of the document body.
  useEffect(() => {
    if (isEditingLink) {
      linkTextInputRef.current?.focus();
    }
  }, [isEditingLink, activeLink?.key]);

  /** Saves the link draft with Enter from either popover field, like a form. */
  const handleEditFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== RICH_TEXT_EDITOR_KEY.enter) {
      return;
    }

    event.preventDefault();

    if (activeLink && isLinkEditValid) {
      saveLinkEdit(activeLink);
    }
  };

  return (
    <div
      aria-describedby={ariaDescribedBy}
      aria-disabled={isDisabled}
      aria-invalid={isInvalid}
      aria-label={ariaLabel}
      aria-multiline
      className={editorClassName}
      contentEditable={!isDisabled}
      data-placeholder={placeholder}
      onBeforeInput={handleBeforeInput}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      ref={setEditorElement}
      role="textbox"
      suppressContentEditableWarning
    >
      {hasContent
        ? segments.map((segment) =>
            segment.type === RICH_TEXT_SEGMENT_TYPE.link ? (
              isDisabled ? (
                <a
                  aria-disabled
                  className={styles.RichLinkEditor__editorLink}
                  href={segment.url}
                  key={segment.key}
                  onClick={(event) => {
                    event.preventDefault();
                  }}
                  rel={LINK_REL}
                  tabIndex={-1}
                  target={LINK_TARGET}
                >
                  {segment.text}
                </a>
              ) : (
              <Popover
                key={segment.key}
                onOpenChange={(isOpen) => {
                  if (isOpen) {
                    openLinkPopover(segment);
                  } else if (activeLink?.key === segment.key) {
                    closeLinkPopover();
                  }
                }}
                open={activeLink?.key === segment.key}
              >
                <PopoverTrigger asChild>
                  <a
                    className={styles.RichLinkEditor__editorLink}
                    href={segment.url}
                    onClick={(event) => {
                      event.preventDefault();
                      openLinkPopover(segment);
                    }}
                    rel={LINK_REL}
                    target={LINK_TARGET}
                  >
                    {segment.text}
                  </a>
                </PopoverTrigger>
                <PopoverContent
                  className={styles.RichLinkEditor__popover}
                  onBeforeInput={(event) => {
                    event.stopPropagation();
                  }}
                  onInput={(event) => {
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                  }}
                  onPaste={(event) => {
                    event.stopPropagation();
                  }}
                >
                  {popoverMode === RICH_LINK_POPOVER_MODE.actions ? (
                    <div className={styles.RichLinkEditor__actions}>
                      <Button
                        onClick={() => {
                          setPopoverMode(RICH_LINK_POPOVER_MODE.edit);
                        }}
                        type={BUTTON_TYPE}
                        variant={BUTTON_VARIANT.ghost}
                      >
                        {copy.editAction}
                      </Button>
                      <Button
                        onClick={() => {
                          removeLink(segment);
                        }}
                        type={BUTTON_TYPE}
                        variant={BUTTON_VARIANT.ghost}
                      >
                        {copy.removeAction}
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.RichLinkEditor__editForm}>
                      <label className={styles.RichLinkEditor__label}>
                        <span>{copy.popoverTextLabel}</span>
                        <input
                          className={styles.RichLinkEditor__input}
                          onChange={(event) => {
                            setLinkTextInput(event.currentTarget.value);
                          }}
                          onKeyDown={handleEditFieldKeyDown}
                          ref={linkTextInputRef}
                          value={linkTextInput}
                        />
                      </label>
                      <label className={styles.RichLinkEditor__label}>
                        <span>{copy.popoverUrlLabel}</span>
                        <input
                          aria-invalid={hasInvalidLinkUrl}
                          className={styles.RichLinkEditor__input}
                          onChange={(event) => {
                            setLinkUrlInput(event.currentTarget.value);
                          }}
                          onKeyDown={handleEditFieldKeyDown}
                          type={URL_INPUT_TYPE}
                          value={linkUrlInput}
                        />
                      </label>
                      <div className={styles.RichLinkEditor__actions}>
                        <Button
                          disabled={!isLinkEditValid}
                          onClick={() => {
                            if (activeLink) {
                              saveLinkEdit(activeLink);
                            }
                          }}
                          type={BUTTON_TYPE}
                        >
                          {copy.editSave}
                        </Button>
                        <Button
                          onClick={closeLinkPopover}
                          type={BUTTON_TYPE}
                          variant={BUTTON_VARIANT.outline}
                        >
                          {copy.editCancel}
                        </Button>
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              )
            ) : (
              segment.text
            )
          )
        : null}
    </div>
  );
}
