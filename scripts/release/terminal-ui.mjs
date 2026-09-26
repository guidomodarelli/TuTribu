/**
 * Dependency-free terminal UI for `pnpm create-version`: colors, gradient banner,
 * rounded boxes, step headers, spinners and interactive prompts (arrow-key
 * select and yes/no confirm).
 *
 * Colors go through `util.styleText`, which drops ANSI codes automatically
 * when stdout is not a TTY or `NO_COLOR` is set. Interactive prompts fall
 * back to their default answer when stdin is not a TTY, so the script never
 * hangs in a pipe.
 *
 * @module terminal-ui
 */

import { emitKeypressEvents } from "node:readline";
import { stripVTControlCharacters, styleText } from "node:util";

/** Widest box drawn, so lines stay readable on large terminals. */
const MAX_BOX_WIDTH = 84;

/** Width assumed when stdout does not report its columns. */
const FALLBACK_TERMINAL_WIDTH = 80;

/** Horizontal padding inside a box, per side. */
const BOX_PADDING = 1;

/** Spinner animation frames and their interval. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

/** Time spent waiting for answers, excluded from the reported total. */
let promptWaitMs = 0;

/**
 * Returns how long the command has waited for the user's answers.
 *
 * @returns {number} Milliseconds spent with a prompt open.
 */
export function getPromptWaitMs() {
  return promptWaitMs;
}

/**
 * Measures the elapsed time since a start, without the time spent waiting for answers.
 *
 * @param {number} startedAt - `Date.now()` when the measured work started.
 * @param {number} promptWaitAtStart - {@link getPromptWaitMs} at that moment.
 * @returns {number} Active milliseconds.
 */
export function measureActiveMs(startedAt, promptWaitAtStart = 0) {
  return Date.now() - startedAt - (promptWaitMs - promptWaitAtStart);
}

/** Exit code conventionally used after Ctrl+C. */
export const INTERRUPTED_EXIT_CODE = 130;

/** Splits styled text into ANSI escape sequences and single code points. */
const ANSI_TOKEN_PATTERN = /\x1b\[[0-9;]*m|[\s\S]/gu;

/** Resets every style after a truncated, styled line. */
const ANSI_RESET = "\x1b[0m";

/** ANSI control sequences used by the interactive prompts. */
const ANSI = {
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  clearLine: "\r\x1b[2K",
  clearBelow: "\x1b[0J",
  cursorUp: (lineCount) => (lineCount > 0 ? `\x1b[${lineCount}A` : ""),
};

/** Border color of each box tone. */
export const BOX_TONE = {
  neutral: "gray",
  info: "cyan",
  success: "green",
  warning: "yellow",
  danger: "red",
  accent: "magenta",
};

/**
 * Icons shared by status lines. They use Nerd Font glyphs (Font Awesome set),
 * so the terminal needs a Nerd Font, the same one the oh-my-posh prompt uses.
 */
export const ICON = {
  success: styleText("green", "\uf00c"), // nf-fa-check
  failure: styleText("red", "\uf00d"), // nf-fa-times
  warning: styleText("yellow", "\uf071"), // nf-fa-warning
  info: styleText("cyan", "\uf05a"), // nf-fa-info_circle
  pending: styleText("gray", "\uf10c"), // nf-fa-circle_o
  arrow: styleText("magenta", "\uf054"), // nf-fa-chevron_right
  bullet: styleText("gray", "\uf444"), // nf-oct-dot_fill
  star: styleText("yellow", "\uf005"), // nf-fa-star
  rocket: "\uf135", // nf-fa-rocket
};

/**
 * Applies one or more `util.styleText` formats.
 *
 * @param {string | string[]} format - Format names such as `"bold"` or `["cyan", "bold"]`.
 * @param {string} text - Text to style.
 * @returns {string} Styled text (plain when colors are disabled).
 */
export function paint(format, text) {
  return styleText(format, text);
}

/**
 * Measures the visible width of a string, ignoring ANSI codes.
 *
 * @param {string} text - Possibly styled text.
 * @returns {number} Visible column count.
 */
export function visibleWidth(text) {
  return [...stripVTControlCharacters(text)].length;
}

/** Label/value rows (`renderRow`): the value starts after a gap of two or more spaces. */
const VALUE_COLUMN_PATTERN = /^\s*\S(?:.*?\S)?\s{2,}(?=\S)/u;

/** Leading marker (icon, arrow, bullet or `1.`, never a word) followed by a space, used as hanging indent. */
const HANGING_MARKER_PATTERN = /^(\s*)((?:[^\p{L}\p{N}\s]{1,2}|\d{1,2}\.)\s+)?/u;

/**
 * Splits styled text into words (with their ANSI codes) and the spaces between them.
 *
 * @param {string} text - Possibly styled text.
 * @returns {{ text: string, width: number, isSpace: boolean }[]} Segments in order.
 */
function splitStyledSegments(text) {
  const segments = [];

  for (const token of text.match(ANSI_TOKEN_PATTERN) ?? []) {
    const isEscape = token.startsWith("\x1b");
    const isSpace = !isEscape && token === " ";
    const last = segments.at(-1);

    // An escape after a space starts the next word so it is never dropped with a line-start space.
    if (last && ((isEscape && !last.isSpace) || (!isEscape && last.isSpace === isSpace))) {
      last.text += token;
      last.width += isEscape ? 0 : 1;
    } else {
      segments.push({ text: token, width: isEscape ? 0 : 1, isSpace });
    }
  }

  return segments;
}

/**
 * Returns the ANSI sequences seen so far, so a continuation line reopens the active styles.
 *
 * @param {string} text - Styled text already emitted.
 * @returns {string} Concatenated escape sequences.
 */
function collectEscapes(text) {
  return (text.match(ANSI_TOKEN_PATTERN) ?? []).filter((token) => token.startsWith("\x1b")).join("");
}

/**
 * Word-wraps a styled line to a visible width without ever cutting it off:
 * words move to the next line, continuation lines align after a leading
 * marker (icon, arrow, bullet or `1.`), styles are closed at each break and
 * reopened on the next line, and a word longer than the width is split.
 *
 * @param {string} text - Possibly styled line.
 * @param {number} width - Maximum visible width.
 * @returns {string[]} Lines that each fit in `width` columns.
 */
export function wrapStyledLine(text, width) {
  if (visibleWidth(text) <= width) {
    return [text];
  }

  // Continuation lines align with the value column of a row, or after a leading marker.
  const plainText = stripVTControlCharacters(text);
  const indentPrefix = VALUE_COLUMN_PATTERN.exec(plainText)?.[0] ?? HANGING_MARKER_PATTERN.exec(plainText)?.[0] ?? "";
  const indentWidth = [...indentPrefix].length;
  const hangingIndent = indentWidth < width / 2 ? " ".repeat(indentWidth) : "";
  const lines = [];
  let current = "";
  let currentWidth = 0;
  let emitted = "";

  const breakLine = () => {
    const hasStyles = current !== stripVTControlCharacters(current);
    lines.push(`${current.trimEnd()}${hasStyles ? ANSI_RESET : ""}`);
    emitted += current;
    current = `${hangingIndent}${collectEscapes(emitted)}`;
    currentWidth = hangingIndent.length;
  };

  for (const segment of splitStyledSegments(text)) {
    const isLineStart = currentWidth === hangingIndent.length && lines.length > 0;

    if (segment.isSpace) {
      if (!isLineStart) {
        current += segment.text;
        currentWidth += segment.width;
      }
      continue;
    }

    // Move the word to the next line only when it fits there; a longer word is split right here.
    const fitsOnFreshLine = hangingIndent.length + segment.width <= width;
    if (currentWidth + segment.width > width && currentWidth > hangingIndent.length && fitsOnFreshLine) {
      breakLine();
    }

    // A single word wider than the line is split across lines instead of truncated.
    for (const token of segment.text.match(ANSI_TOKEN_PATTERN) ?? []) {
      const isEscape = token.startsWith("\x1b");

      if (!isEscape && currentWidth >= width) {
        breakLine();
      }

      current += token;
      currentWidth += isEscape ? 0 : 1;
    }
  }

  if (stripVTControlCharacters(current).trim()) {
    const hasStyles = current !== stripVTControlCharacters(current);
    lines.push(`${current.trimEnd()}${hasStyles ? ANSI_RESET : ""}`);
  }

  return lines;
}

/**
 * Returns the box width for the current terminal.
 *
 * @returns {number} Outer width in columns.
 */
export function resolveBoxWidth() {
  const columns = process.stdout.columns || FALLBACK_TERMINAL_WIDTH;
  return Math.min(columns - 2, MAX_BOX_WIDTH);
}

/**
 * Renders a rounded box with an optional title in its top border. Long lines
 * are word-wrapped, never truncated; a title that does not fit in the border
 * moves inside the box as its first lines.
 *
 * @param {{ title?: string, lines: string[], tone?: string, width?: number }} options - Box content.
 * @returns {string} Multi-line box.
 */
export function renderBox({ title, lines, tone = BOX_TONE.neutral, width = resolveBoxWidth() }) {
  const border = (text) => paint(tone, text);
  const innerWidth = width - 2;
  const contentWidth = innerWidth - BOX_PADDING * 2;
  const titleText = title ? ` ${paint("bold", title)} ` : "";
  const titleFits = visibleWidth(titleText) + 1 <= innerWidth;
  const borderTitle = titleFits ? titleText : "";
  const topFill = Math.max(innerWidth - visibleWidth(borderTitle) - 1, 0);
  const top = `${border("╭─")}${borderTitle}${border(`${"─".repeat(topFill)}╮`)}`;
  const padding = " ".repeat(BOX_PADDING);
  const contentLines = titleFits || !title ? lines : [paint("bold", title), "", ...lines];
  const body = contentLines
    .flatMap((line) => wrapStyledLine(line, contentWidth))
    .map((line) => {
      const fill = " ".repeat(Math.max(contentWidth - visibleWidth(line), 0));
      return `${border("│")}${padding}${line}${fill}${padding}${border("│")}`;
    });
  const bottom = border(`╰${"─".repeat(innerWidth)}╯`);

  return [top, ...body, bottom].join("\n");
}

/**
 * Renders a label/value row aligned for status panels.
 *
 * @param {string} icon - Leading icon.
 * @param {string} label - Left column.
 * @param {string} value - Right column.
 * @param {number} [labelWidth] - Width of the label column.
 * @returns {string} Row.
 */
export function renderRow(icon, label, value, labelWidth = 16) {
  return `${icon} ${paint("bold", label.padEnd(labelWidth))}${value}`;
}

/**
 * Renders the one-line header shown when the command starts: an inverted
 * `RELEASE` label, the project name, the published version aligned to the
 * right and a rule underneath.
 *
 * @param {{ projectName: string, publishedLabel: string | null }} options - Header content.
 * @returns {string} Header.
 */
export function renderBanner({ projectName, publishedLabel }) {
  const width = resolveBoxWidth();
  const left = `${paint(["inverse", "bold", "magenta"], " RELEASE ")}  ${paint("bold", projectName)}`;
  const right = publishedLabel ? paint("gray", publishedLabel) : "";
  const gap = " ".repeat(Math.max(width - visibleWidth(left) - visibleWidth(right), 2));

  return ["", `${left}${gap}${right}`, paint("gray", "─".repeat(width)), ""].join("\n");
}

/**
 * Renders the header that introduces each executed step.
 *
 * @param {number} stepNumber - 1-based index.
 * @param {number} stepCount - Total steps.
 * @param {string} title - Step title.
 * @returns {string} Header line.
 */
export function renderStepHeader(stepNumber, stepCount, title) {
  const label = paint(["bold", "magenta"], ` PASO ${stepNumber}/${stepCount} `);
  const text = ` ${paint("bold", title)} `;
  const fill = Math.max(resolveBoxWidth() - visibleWidth(label) - visibleWidth(text) - 2, 2);

  return `\n${paint("magenta", "━━")}${label}${paint("gray", "━")}${text}${paint("gray", "━".repeat(fill))}`;
}

/**
 * Writes a line to stdout.
 *
 * @param {string} [text] - Line content.
 */
export function print(text = "") {
  process.stdout.write(`${text}\n`);
}

/**
 * Formats a duration in a compact Spanish form.
 *
 * @param {number} milliseconds - Duration.
 * @returns {string} Such as `3.2 s` or `4 min 05 s`.
 */
export function formatDuration(milliseconds) {
  const totalSeconds = milliseconds / 1000;

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)} s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
}

/**
 * Starts a spinner; on non-TTY outputs it prints the label once instead.
 *
 * @param {string} label - Initial label.
 * @returns {{ update: (label: string) => void, succeed: (label?: string) => void, fail: (label?: string) => void }} Controls.
 */
export function startSpinner(label) {
  const isInteractive = Boolean(process.stdout.isTTY);
  const startedAt = Date.now();
  let currentLabel = label;
  let frameIndex = 0;
  let timer = null;

  const render = () => {
    const frame = paint("magenta", SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]);
    process.stdout.write(`${ANSI.clearLine}${frame} ${currentLabel}`);
    frameIndex += 1;
  };

  if (isInteractive) {
    process.stdout.write(ANSI.hideCursor);
    render();
    timer = setInterval(render, SPINNER_INTERVAL_MS);
  } else {
    print(`${ICON.pending} ${label}`);
  }

  const stop = (icon, finalLabel) => {
    if (timer) {
      clearInterval(timer);
      process.stdout.write(`${ANSI.clearLine}${ANSI.showCursor}`);
    }

    print(`${icon} ${finalLabel ?? currentLabel} ${paint("gray", formatDuration(Date.now() - startedAt))}`);
  };

  return {
    update(nextLabel) {
      currentLabel = nextLabel;
      if (!isInteractive) {
        print(`${ICON.pending} ${nextLabel}`);
      }
    },
    succeed: (finalLabel) => stop(ICON.success, finalLabel),
    fail: (finalLabel) => stop(ICON.failure, finalLabel),
  };
}

/**
 * Restores the terminal and exits after Ctrl+C.
 */
function exitOnInterrupt() {
  process.stdout.write(`${ANSI.showCursor}\n`);
  print(`${ICON.warning} ${paint("yellow", "Release cancelado por el usuario. No se tocó nada más.")}`);
  process.exit(INTERRUPTED_EXIT_CODE);
}

/**
 * Asks the user to choose one option with the arrow keys.
 *
 * @param {{ message: string, options: { label: string, hint?: string, value: string }[], defaultIndex?: number }} prompt - Prompt.
 * @returns {Promise<string>} Selected value (the default one when stdin is not a TTY).
 */
export function select({ message, options, defaultIndex = 0 }) {
  const input = process.stdin;
  const question = `${paint(["bold", "cyan"], "?")} ${paint("bold", message)}`;

  if (!input.isTTY) {
    print(`${question} ${paint("gray", `→ ${options[defaultIndex].label} (sin terminal interactiva)`)}`);
    return Promise.resolve(options[defaultIndex].value);
  }

  return new Promise((resolve) => {
    const promptStartedAt = Date.now();
    let selectedIndex = defaultIndex;
    let renderedLineCount = 0;

    const render = () => {
      const lines = [
        question,
        ...options.map((option, index) => {
          const isSelected = index === selectedIndex;
          const pointer = isSelected ? ICON.arrow : " ";
          const label = isSelected ? paint(["bold", "magentaBright"], option.label) : option.label;
          const hint = option.hint ? `  ${paint("gray", option.hint)}` : "";
          return `  ${pointer} ${label}${hint}`;
        }),
        paint("gray", "  ↑/↓ para moverte · Enter para confirmar"),
      ];
      process.stdout.write(`${ANSI.cursorUp(renderedLineCount)}\r${ANSI.clearBelow}${lines.join("\n")}\n`);
      renderedLineCount = lines.length;
    };

    const finish = () => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
      const chosen = options[selectedIndex];
      process.stdout.write(`${ANSI.cursorUp(renderedLineCount)}\r${ANSI.clearBelow}${ANSI.showCursor}`);
      print(`${question} ${paint("magentaBright", chosen.label)}`);
      promptWaitMs += Date.now() - promptStartedAt;
      resolve(chosen.value);
    };

    const onKeypress = (_text, key = {}) => {
      if (key.ctrl && key.name === "c") {
        input.setRawMode(false);
        exitOnInterrupt();
      } else if (key.name === "up" || key.name === "k") {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        render();
      } else if (key.name === "down" || key.name === "j" || key.name === "tab") {
        selectedIndex = (selectedIndex + 1) % options.length;
        render();
      } else if (key.name === "return" || key.name === "enter") {
        finish();
      }
    };

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKeypress);
    process.stdout.write(ANSI.hideCursor);
    render();
  });
}

/**
 * Asks a yes/no question with the arrow-key selector.
 *
 * @param {string} message - Question.
 * @param {boolean} [defaultAnswer] - Answer preselected (and used without a TTY).
 * @returns {Promise<boolean>} Answer.
 */
export async function confirm(message, defaultAnswer = true) {
  const options = [
    { label: "Sí", value: "yes" },
    { label: "No", value: "no" },
  ];
  const answer = await select({ message, options, defaultIndex: defaultAnswer ? 0 : 1 });

  return answer === "yes";
}
