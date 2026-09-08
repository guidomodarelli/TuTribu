"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useState } from "react";
import type { EmojiClickData, PickerProps } from "emoji-picker-react";
import {
  EmojiStyle,
  SkinTonePickerLocation,
  SkinTones,
  SuggestionMode,
  Theme,
} from "emoji-picker-react";
import { SmilePlusIcon } from "lucide-react";

import { Button, Popover, PopoverContent, PopoverTrigger, useTheme } from "beez-ui";

import { DARK_THEME_MODE } from "@/src/constants/theme-mode";
import styles from "./styles.module.scss";

const CHANNEL_EMOJI_PICKER_COPY = {
  chooseEmoji: "Elegir ícono",
  pickerLabel: "Selector de íconos",
  searchPlaceholder: "Buscar ícono",
} as const;

const CHANNEL_EMOJI_PICKER_CONFIG = {
  align: "start",
  buttonType: "button",
  pickerHeight: 360,
  pickerWidth: 320,
  outlineVariant: "outline",
} as const;

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
}) as ComponentType<PickerProps>;

type ChannelEmojiPickerProps = {
  disabled?: boolean;
  /**
   * Keeps the label for assistive technology but hides it visually, for rows
   * where a visible "Ícono" label next to every trigger would be noise.
   */
  isLabelVisuallyHidden?: boolean;
  label: string;
  onChange: (emoji: string) => void;
  value: string;
};

export function ChannelEmojiPicker({
  disabled = false,
  isLabelVisuallyHidden = false,
  label,
  onChange,
  value,
}: ChannelEmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const emojiPickerTheme = resolvedTheme === DARK_THEME_MODE ? Theme.DARK : Theme.LIGHT;
  const selectedEmoji = value.trim();

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onChange(emojiData.emoji);
    setIsOpen(false);
  };

  return (
    <div className={styles.ChannelEmojiPicker}>
      <span
        className={
          isLabelVisuallyHidden
            ? `${styles.ChannelEmojiPicker__label} ${styles["ChannelEmojiPicker__label--visuallyHidden"]}`
            : styles.ChannelEmojiPicker__label
        }
      >
        {label}
      </span>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label={CHANNEL_EMOJI_PICKER_COPY.chooseEmoji}
            className={styles.ChannelEmojiPicker__trigger}
            disabled={disabled}
            type={CHANNEL_EMOJI_PICKER_CONFIG.buttonType}
            variant={CHANNEL_EMOJI_PICKER_CONFIG.outlineVariant}
          >
            <span
              aria-hidden
              className={styles.ChannelEmojiPicker__selectedEmoji}
            >
              {selectedEmoji || <SmilePlusIcon />}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align={CHANNEL_EMOJI_PICKER_CONFIG.align}
          aria-label={CHANNEL_EMOJI_PICKER_COPY.pickerLabel}
          className={styles.ChannelEmojiPicker__content}
        >
          <EmojiPicker
            autoFocusSearch
            customEmojis={[]}
            defaultSkinTone={SkinTones.NEUTRAL}
            emojiStyle={EmojiStyle.APPLE}
            height={CHANNEL_EMOJI_PICKER_CONFIG.pickerHeight}
            lazyLoadEmojis
            onEmojiClick={handleEmojiClick}
            previewConfig={{ showPreview: false }}
            searchDisabled={false}
            searchPlaceholder={CHANNEL_EMOJI_PICKER_COPY.searchPlaceholder}
            skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
            skinTonesDisabled={false}
            suggestedEmojisMode={SuggestionMode.RECENT}
            theme={emojiPickerTheme}
            width={CHANNEL_EMOJI_PICKER_CONFIG.pickerWidth}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
