"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useState, useSyncExternalStore } from "react";
import type { EmojiClickData, PickerProps } from "emoji-picker-react";
import {
  EmojiStyle,
  SkinTonePickerLocation,
  SkinTones,
  SuggestionMode,
  Theme,
} from "emoji-picker-react";
import { SmilePlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DARK_THEME_CLASS_NAME } from "@/src/constants/theme-mode";
import styles from "./styles.module.scss";

const CHANNEL_EMOJI_PICKER_COPY = {
  chooseEmoji: "Elegir ícono",
  pickerLabel: "Selector de íconos",
  searchPlaceholder: "Buscar ícono",
} as const;

const CHANNEL_EMOJI_PICKER_CONFIG = {
  align: "start",
  buttonType: "button",
  classAttribute: "class",
  pickerHeight: 360,
  pickerWidth: 320,
  outlineVariant: "outline",
} as const;

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
}) as ComponentType<PickerProps>;

function readDocumentEmojiPickerTheme() {
  return document.documentElement.classList.contains(DARK_THEME_CLASS_NAME)
    ? Theme.DARK
    : Theme.LIGHT;
}

function getServerEmojiPickerTheme() {
  return Theme.LIGHT;
}

function subscribeToThemeClassChange(onStoreChange: () => void) {
  const themeObserver = new MutationObserver(onStoreChange);

  themeObserver.observe(document.documentElement, {
    attributeFilter: [CHANNEL_EMOJI_PICKER_CONFIG.classAttribute],
    attributes: true,
  });

  return () => {
    themeObserver.disconnect();
  };
}

type ChannelEmojiPickerProps = {
  disabled?: boolean;
  label: string;
  onChange: (emoji: string) => void;
  value: string;
};

export function ChannelEmojiPicker({
  disabled = false,
  label,
  onChange,
  value,
}: ChannelEmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const emojiPickerTheme = useSyncExternalStore(
    subscribeToThemeClassChange,
    readDocumentEmojiPickerTheme,
    getServerEmojiPickerTheme
  );
  const selectedEmoji = value.trim();

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onChange(emojiData.emoji);
    setIsOpen(false);
  };

  return (
    <div className={styles.ChannelEmojiPicker}>
      <span className={styles.ChannelEmojiPicker__label}>{label}</span>
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
