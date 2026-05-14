const EMOJI_PATTERN = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})/u;
const KEYCAP_EMOJI_PATTERN = /^[0-9#*]\uFE0F?\u20E3$/u;
const GRAPHEME_GRANULARITY = "grapheme";

function splitGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: GRAPHEME_GRANULARITY }).segment(value),
      (segment) => segment.segment
    );
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
