import { describe, it, expect } from "vitest";
import {
  STORY_BLOCK_TYPE,
  STORY_INLINE_TYPE,
  buildStoryPlainTextExcerpt,
  parseStoryBlocks,
} from "@/lib/rich-text/story-markdown";

describe("buildStoryPlainTextExcerpt", () => {
  it("strips formatting and keeps the plain text", () => {
    expect(
      buildStoryPlainTextExcerpt(
        "Somos **una tribu**\n- Honestidad\nMirá [el manifiesto](https://tribu.example.com)",
        160
      )
    ).toBe("Somos una tribu Honestidad Mirá el manifiesto");
  });

  it("trims long content with an ellipsis within the limit", () => {
    const excerpt = buildStoryPlainTextExcerpt("a".repeat(300), 160);

    expect(excerpt.length).toBeLessThanOrEqual(160);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});

describe("parseStoryBlocks", () => {
  it("splits paragraphs on blank lines and keeps single line breaks inside a paragraph", () => {
    const blocks = parseStoryBlocks(
      "Primera línea\nsegunda línea\n\nOtro párrafo"
    );

    expect(blocks).toEqual([
      {
        segments: [
          {
            text: "Primera línea\nsegunda línea",
            type: STORY_INLINE_TYPE.text,
          },
        ],
        type: STORY_BLOCK_TYPE.paragraph,
      },
      {
        segments: [{ text: "Otro párrafo", type: STORY_INLINE_TYPE.text }],
        type: STORY_BLOCK_TYPE.paragraph,
      },
    ]);
  });

  it("groups consecutive dash and asterisk lines into a single list", () => {
    const blocks = parseStoryBlocks(
      "Nuestros valores:\n- Honestidad\n* Comunidad\nCierre"
    );

    expect(blocks).toEqual([
      {
        segments: [
          { text: "Nuestros valores:", type: STORY_INLINE_TYPE.text },
        ],
        type: STORY_BLOCK_TYPE.paragraph,
      },
      {
        items: [
          [{ text: "Honestidad", type: STORY_INLINE_TYPE.text }],
          [{ text: "Comunidad", type: STORY_INLINE_TYPE.text }],
        ],
        type: STORY_BLOCK_TYPE.list,
      },
      {
        segments: [{ text: "Cierre", type: STORY_INLINE_TYPE.text }],
        type: STORY_BLOCK_TYPE.paragraph,
      },
    ]);
  });

  it("parses inline bold segments", () => {
    const blocks = parseStoryBlocks("Somos **una tribu** abierta");

    expect(blocks).toEqual([
      {
        segments: [
          { text: "Somos ", type: STORY_INLINE_TYPE.text },
          { text: "una tribu", type: STORY_INLINE_TYPE.bold },
          { text: " abierta", type: STORY_INLINE_TYPE.text },
        ],
        type: STORY_BLOCK_TYPE.paragraph,
      },
    ]);
  });

  it("keeps markdown links working next to bold text and inside list items", () => {
    const blocks = parseStoryBlocks(
      "**Sumate** vía [el manifiesto](https://tribu.example.com)\n- Leé [las reglas](https://tribu.example.com/reglas)"
    );

    expect(blocks).toEqual([
      {
        segments: [
          { text: "Sumate", type: STORY_INLINE_TYPE.bold },
          { text: " vía ", type: STORY_INLINE_TYPE.text },
          {
            text: "el manifiesto",
            type: STORY_INLINE_TYPE.link,
            url: "https://tribu.example.com",
          },
        ],
        type: STORY_BLOCK_TYPE.paragraph,
      },
      {
        items: [
          [
            { text: "Leé ", type: STORY_INLINE_TYPE.text },
            {
              text: "las reglas",
              type: STORY_INLINE_TYPE.link,
              url: "https://tribu.example.com/reglas",
            },
          ],
        ],
        type: STORY_BLOCK_TYPE.list,
      },
    ]);
  });

  it("never interprets raw HTML as markup", () => {
    const blocks = parseStoryBlocks("<script>alert(1)</script>");

    expect(blocks).toEqual([
      {
        segments: [
          { text: "<script>alert(1)</script>", type: STORY_INLINE_TYPE.text },
        ],
        type: STORY_BLOCK_TYPE.paragraph,
      },
    ]);
  });
});
