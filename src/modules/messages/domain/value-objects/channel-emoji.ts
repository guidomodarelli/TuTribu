const EMOJI_PATTERN = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})/u;
const KEYCAP_EMOJI_PATTERN = /^[0-9#*]\uFE0F?\u20E3$/u;
const GRAPHEME_GRANULARITY = "grapheme";

/** Built once, and only where the runtime supports grapheme segmentation. */
const GRAPHEME_SEGMENTER =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: GRAPHEME_GRANULARITY })
    : null;

function splitGraphemes(value: string): string[] {
  if (GRAPHEME_SEGMENTER) {
    return Array.from(GRAPHEME_SEGMENTER.segment(value), (segment) => segment.segment);
  }

  return Array.from(value);
}

export function isSingleEmoji(value: string): boolean {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return false;
  }

  const graphemes = splitGraphemes(normalizedValue);

  return (
    graphemes.length === 1 &&
    (EMOJI_PATTERN.test(graphemes[0]) || KEYCAP_EMOJI_PATTERN.test(graphemes[0]))
  );
}
