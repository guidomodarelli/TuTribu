import { describe, it, expect } from "vitest";
import {
  deserializeMarkdownForEditor,
  escapeMarkdownLinkUrl,
  getLinksAfterTextChange,
  getTextDiff,
  getWordDeletionRange,
  isBareUrlMatchInsideEmail,
  normalizeMarkdownUrl,
  parsePreviewSegments,
  parseRichTextSegments,
  rangesOverlap,
  serializeEditorContent,
} from "@/lib/rich-text/link-markdown";
import {
  RICH_LINK_KIND,
  RICH_PREVIEW_LINK_SOURCE,
  RICH_TEXT_EDITOR_WORD_DIRECTION,
  RICH_TEXT_SEGMENT_TYPE,
} from "@/lib/rich-text/link-markdown-constants";
import type { RichLink } from "@/lib/rich-text/link-markdown-types";

describe("normalizeMarkdownUrl", () => {
  it("keeps an absolute https URL", () => {
    expect(normalizeMarkdownUrl("https://tutribu.com/curso")).toBe(
      "https://tutribu.com/curso"
    );
  });

  it("prefixes a bare domain with https", () => {
    expect(normalizeMarkdownUrl("tutribu.com")).toBe("https://tutribu.com");
  });

  it("rejects non-http protocols", () => {
    expect(normalizeMarkdownUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects a dotted email local part instead of reading it as credentials", () => {
    expect(normalizeMarkdownUrl("john.doe@example.com")).toBeNull();
  });

  it("rejects a scheme-less bare domain that carries userinfo", () => {
    expect(normalizeMarkdownUrl("user@example.com/path")).toBeNull();
  });

  it("keeps an @ that belongs to a bare domain query string", () => {
    expect(normalizeMarkdownUrl("example.com/buscar?ref=a@b")).toBe(
      "https://example.com/buscar?ref=a@b"
    );
  });

  it("returns null for empty or whitespace input", () => {
    expect(normalizeMarkdownUrl("   ")).toBeNull();
    expect(normalizeMarkdownUrl(null)).toBeNull();
  });

  it("percent-encodes whitespace so the URL round-trips through markdown", () => {
    expect(normalizeMarkdownUrl("https://example.com/a b")).toBe(
      "https://example.com/a%20b"
    );
  });

  it("rejects a bare domain whose path contains whitespace", () => {
    expect(normalizeMarkdownUrl("example.com/a b")).toBeNull();
  });

  it("leaves an already encoded URL untouched", () => {
    expect(normalizeMarkdownUrl("https://example.com/a%20b")).toBe(
      "https://example.com/a%20b"
    );
  });

  it("returns a URL the renderer can read back as a link", () => {
    const normalizedUrl = normalizeMarkdownUrl("https://example.com/a b");
    const markdown = `[texto](${normalizedUrl})`;
    const segments = parseRichTextSegments(markdown);

    expect(segments).toEqual([
      {
        text: "texto",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://example.com/a%20b",
      },
    ]);
  });
});

describe("escapeMarkdownLinkUrl", () => {
  it("percent-encodes an unmatched closing parenthesis", () => {
    expect(escapeMarkdownLinkUrl("https://example.com/a)b")).toBe(
      "https://example.com/a%29b"
    );
  });

  it("percent-encodes an unmatched opening parenthesis", () => {
    expect(escapeMarkdownLinkUrl("https://example.com/a(b")).toBe(
      "https://example.com/a%28b"
    );
  });

  it("preserves a balanced single-level parenthesis pair", () => {
    expect(escapeMarkdownLinkUrl("https://en.wikipedia.org/wiki/Foo_(bar)")).toBe(
      "https://en.wikipedia.org/wiki/Foo_(bar)"
    );
  });

  it("encodes nested parentheses the markdown URL group cannot represent", () => {
    expect(escapeMarkdownLinkUrl("https://example.com/(a(b)c)")).toBe(
      "https://example.com/%28a(b)c%29"
    );
  });

  it("leaves a URL without parentheses untouched", () => {
    expect(escapeMarkdownLinkUrl("https://example.com/a%20b")).toBe(
      "https://example.com/a%20b"
    );
  });
});

describe("parseRichTextSegments", () => {
  it("returns a single text segment for plain text", () => {
    const segments = parseRichTextSegments("hola mundo");

    expect(segments).toEqual([
      { text: "hola mundo", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("auto-detects a bare URL as a link", () => {
    const segments = parseRichTextSegments("mirá https://tutribu.com ahora");

    expect(segments).toEqual([
      { text: "mirá ", type: RICH_TEXT_SEGMENT_TYPE.text },
      {
        text: "https://tutribu.com",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com",
      },
      { text: " ahora", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("auto-detects a www domain and adds https", () => {
    const segments = parseRichTextSegments("www.tutribu.com");

    expect(segments).toEqual([
      {
        text: "www.tutribu.com",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://www.tutribu.com",
      },
    ]);
  });

  it("auto-detects a bare domain and adds https", () => {
    const segments = parseRichTextSegments("entrá a tutribu.com hoy");

    expect(segments).toEqual([
      { text: "entrá a ", type: RICH_TEXT_SEGMENT_TYPE.text },
      {
        text: "tutribu.com",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com",
      },
      { text: " hoy", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("auto-detects a bare domain with a path", () => {
    const segments = parseRichTextSegments("mirá tutribu.com/curso/algebra");

    expect(segments).toEqual([
      { text: "mirá ", type: RICH_TEXT_SEGMENT_TYPE.text },
      {
        text: "tutribu.com/curso/algebra",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com/curso/algebra",
      },
    ]);
  });

  it("keeps trailing punctuation outside a bare domain link", () => {
    const segments = parseRichTextSegments("entrá a tutribu.com.");

    expect(segments).toEqual([
      { text: "entrá a ", type: RICH_TEXT_SEGMENT_TYPE.text },
      {
        text: "tutribu.com",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com",
      },
      { text: ".", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("keeps prose abbreviations with unknown TLDs as plain text", () => {
    const segments = parseRichTextSegments(
      "Hablamos sobre EE.UU. y China.Por eso revisamos el Nasdaq."
    );

    expect(
      segments.every((segment) => segment.type === RICH_TEXT_SEGMENT_TYPE.text)
    ).toBe(true);
    expect(segments.map((segment) => segment.text).join("")).toBe(
      "Hablamos sobre EE.UU. y China.Por eso revisamos el Nasdaq."
    );
  });

  it("renders a markdown link with custom text", () => {
    const segments = parseRichTextSegments("[el curso](https://tutribu.com)");

    expect(segments).toEqual([
      {
        text: "el curso",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com",
      },
    ]);
  });

  it("does not link an email address", () => {
    const segments = parseRichTextSegments("escribí a hola@tutribu.com");

    expect(
      segments.every((segment) => segment.type === RICH_TEXT_SEGMENT_TYPE.text)
    ).toBe(true);
  });

  it("does not turn a markdown target with an email local part into a credentials link", () => {
    const segments = parseRichTextSegments("[Contacto](john.doe@example.com)");

    expect(segments).toEqual([
      {
        text: "[Contacto](john.doe@example.com)",
        type: RICH_TEXT_SEGMENT_TYPE.text,
      },
    ]);
  });

  it("keeps trailing punctuation outside the link", () => {
    const segments = parseRichTextSegments("entrá a https://tutribu.com.");

    expect(segments).toEqual([
      { text: "entrá a ", type: RICH_TEXT_SEGMENT_TYPE.text },
      {
        text: "https://tutribu.com",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com",
      },
      { text: ".", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("renders a suppressed autolink as plain text", () => {
    const segments = parseRichTextSegments("[tutribu.com](#)");

    expect(segments).toEqual([
      { text: "tutribu.com", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("preserves bracket text that is not a valid link unchanged", () => {
    const segments = parseRichTextSegments("Material [PDF](pendiente) acá");

    expect(segments).toEqual([
      { text: "Material ", type: RICH_TEXT_SEGMENT_TYPE.text },
      { text: "[PDF](pendiente)", type: RICH_TEXT_SEGMENT_TYPE.text },
      { text: " acá", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("preserves a footnote-like bracket reference unchanged", () => {
    const segments = parseRichTextSegments("Ver [1](capítulo)");

    expect(segments).toEqual([
      { text: "Ver ", type: RICH_TEXT_SEGMENT_TYPE.text },
      { text: "[1](capítulo)", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("preserves bracket text whose url is the suppression marker but label is not a url", () => {
    const segments = parseRichTextSegments("[nota](#)");

    expect(segments).toEqual([
      { text: "[nota](#)", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("excludes a wrapping closing bracket from an absolute URL link", () => {
    const segments = parseRichTextSegments("[https://example.com/path]");

    expect(segments).toEqual([
      { text: "[", type: RICH_TEXT_SEGMENT_TYPE.text },
      {
        text: "https://example.com/path",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://example.com/path",
      },
      { text: "]", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });

  it("excludes a wrapping closing bracket from a bare domain link", () => {
    const segments = parseRichTextSegments("[tutribu.com/curso]");

    expect(segments).toEqual([
      { text: "[", type: RICH_TEXT_SEGMENT_TYPE.text },
      {
        text: "tutribu.com/curso",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com/curso",
      },
      { text: "]", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });
});

describe("serializeEditorContent / deserializeMarkdownForEditor", () => {
  it("serializes an explicit link to markdown", () => {
    const links: RichLink[] = [
      {
        end: 8,
        id: "link-1",
        isSynced: false,
        kind: RICH_LINK_KIND.explicit,
        start: 0,
        url: "https://tutribu.com",
      },
    ];

    expect(serializeEditorContent("el curso es lo mejor", links)).toBe(
      "[el curso](https://tutribu.com) es lo mejor"
    );
  });

  it("round-trips content with an explicit link", () => {
    const markdown = "mirá [el curso](https://tutribu.com) ya";
    const editorState = deserializeMarkdownForEditor(markdown);

    expect(editorState.content).toBe("mirá el curso ya");
    expect(serializeEditorContent(editorState.content, editorState.links)).toBe(
      markdown
    );
  });

  it("escapes brackets in the link label on round-trip", () => {
    const markdown = "[texto \\[raro\\]](https://tutribu.com)";
    const editorState = deserializeMarkdownForEditor(markdown);

    expect(editorState.content).toBe("texto [raro]");
    expect(serializeEditorContent(editorState.content, editorState.links)).toBe(
      markdown
    );
  });

  it("keeps bracket text that is not a valid link as literal editor content", () => {
    const markdown = "Material [PDF](pendiente) acá";
    const editorState = deserializeMarkdownForEditor(markdown);

    expect(editorState.content).toBe("Material [PDF](pendiente) acá");
    expect(editorState.links).toHaveLength(0);
    expect(serializeEditorContent(editorState.content, editorState.links)).toBe(
      markdown
    );
  });

  it("serializes an explicit link whose URL has an unmatched ) so it reads back intact", () => {
    const links: RichLink[] = [
      {
        end: 5,
        id: "link-paren",
        isSynced: false,
        kind: RICH_LINK_KIND.explicit,
        start: 0,
        url: "https://example.com/a)b",
      },
    ];

    const serialized = serializeEditorContent("texto", links);

    expect(parseRichTextSegments(serialized)).toEqual([
      {
        text: "texto",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://example.com/a%29b",
      },
    ]);
  });

  it("serializes balanced parentheses in an explicit link URL verbatim", () => {
    const links: RichLink[] = [
      {
        end: 4,
        id: "link-wiki",
        isSynced: false,
        kind: RICH_LINK_KIND.explicit,
        start: 0,
        url: "https://en.wikipedia.org/wiki/Foo_(bar)",
      },
    ];

    const serialized = serializeEditorContent("wiki", links);

    expect(serialized).toBe(
      "[wiki](https://en.wikipedia.org/wiki/Foo_(bar))"
    );
    expect(parseRichTextSegments(serialized)).toEqual([
      {
        text: "wiki",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://en.wikipedia.org/wiki/Foo_(bar)",
      },
    ]);
  });

  it("serializes an edited suppressed autolink as plain text once it is no longer a URL", () => {
    const suppressedLink: RichLink = {
      end: 11,
      id: "link-2",
      kind: RICH_LINK_KIND.suppressed,
      start: 0,
    };
    const links = getLinksAfterTextChange({
      links: [suppressedLink],
      nextText: "nota",
      previousText: "tutribu.com",
    });

    const serialized = serializeEditorContent("nota", links);

    expect(serialized).toBe("nota");
    expect(parseRichTextSegments(serialized)).toEqual([
      { text: "nota", type: RICH_TEXT_SEGMENT_TYPE.text },
    ]);
  });
});

describe("getTextDiff", () => {
  it("reports no change for identical strings", () => {
    expect(getTextDiff({ nextText: "abc", previousText: "abc" }).start).toBe(-1);
  });

  it("locates an inserted region", () => {
    expect(getTextDiff({ nextText: "abXc", previousText: "abc" })).toEqual({
      delta: 1,
      endInNextText: 3,
      endInPreviousText: 2,
      start: 2,
    });
  });
});

describe("getLinksAfterTextChange", () => {
  const explicitLink: RichLink = {
    end: 8,
    id: "link-1",
    isSynced: false,
    kind: RICH_LINK_KIND.explicit,
    start: 0,
    url: "https://tutribu.com",
  };

  const suppressedLink: RichLink = {
    end: 11,
    id: "link-2",
    kind: RICH_LINK_KIND.suppressed,
    start: 0,
  };

  it("keeps a suppressed autolink while its text is still a URL", () => {
    const links = getLinksAfterTextChange({
      links: [suppressedLink],
      nextText: "tutribu.org",
      previousText: "tutribu.com",
    });

    expect(links).toEqual([
      { end: 11, id: "link-2", kind: RICH_LINK_KIND.suppressed, start: 0 },
    ]);
  });

  it("drops a suppressed autolink once its text is no longer a URL", () => {
    const links = getLinksAfterTextChange({
      links: [suppressedLink],
      nextText: "nota",
      previousText: "tutribu.com",
    });

    expect(links).toHaveLength(0);
  });

  it("shifts a link when text is inserted before it", () => {
    const links = getLinksAfterTextChange({
      links: [explicitLink],
      nextText: "ya el curso",
      previousText: "el curso",
    });

    expect(links[0]).toMatchObject({ end: 11, start: 3 });
  });

  it("drops a link fully removed from the text", () => {
    const links = getLinksAfterTextChange({
      links: [explicitLink],
      nextText: "",
      previousText: "el curso",
    });

    expect(links).toHaveLength(0);
  });

  it("keeps the link on the surviving text when a deletion starts before the link and ends inside it", () => {
    // "tutribu" is linked at [5, 12) of "ir a tutribu". Deleting "a tu" (a
    // selection that starts before the link and ends inside it) must move the
    // link onto the surviving "tribu", not leave its start at the stale offset.
    const trackedLink: RichLink = {
      end: 12,
      id: "link-1",
      isSynced: false,
      kind: RICH_LINK_KIND.explicit,
      start: 5,
      url: "https://tutribu.com",
    };
    const nextText = "ir tribu";

    const [adjustedLink] = getLinksAfterTextChange({
      links: [trackedLink],
      nextText,
      previousText: "ir a tutribu",
    });

    expect(adjustedLink).toMatchObject({ end: 8, start: 3 });
    expect(nextText.slice(adjustedLink.start, adjustedLink.end)).toBe("tribu");
  });

  it("keeps the surviving link text when a selection across the boundary is replaced", () => {
    // Replacing "a tu" with "y " keeps "tribu" linked: the inserted text must
    // not be absorbed into the link, and its start must follow the deletion.
    const trackedLink: RichLink = {
      end: 12,
      id: "link-1",
      isSynced: false,
      kind: RICH_LINK_KIND.explicit,
      start: 5,
      url: "https://tutribu.com",
    };
    const nextText = "ir y tribu";

    const [adjustedLink] = getLinksAfterTextChange({
      links: [trackedLink],
      nextText,
      previousText: "ir a tutribu",
    });

    expect(nextText.slice(adjustedLink.start, adjustedLink.end)).toBe("tribu");
  });

  it("keeps the link intact when a non-whitespace character right after it is deleted", () => {
    // "abc" is linked at [0, 3) of "abcX". Deleting "X" removes a character that
    // starts exactly at the link's exclusive end, so it is outside the link and
    // must not shrink it to "ab".
    const trackedLink: RichLink = {
      end: 3,
      id: "link-1",
      isSynced: false,
      kind: RICH_LINK_KIND.explicit,
      start: 0,
      url: "https://tutribu.com",
    };
    const nextText = "abc";

    const [adjustedLink] = getLinksAfterTextChange({
      links: [trackedLink],
      nextText,
      previousText: "abcX",
    });

    expect(adjustedLink).toMatchObject({ end: 3, start: 0 });
    expect(nextText.slice(adjustedLink.start, adjustedLink.end)).toBe("abc");
  });

  it("only shrinks by the deleted link characters when the deletion runs past the link end", () => {
    // "abc" is linked at [0, 3) of "abcX". Deleting "cX" (a selection that
    // starts inside the link and overruns its end) must drop only "c" from the
    // link, leaving it on the surviving "ab"; the trailing "X" was never linked
    // and must not be subtracted from link.end.
    const trackedLink: RichLink = {
      end: 3,
      id: "link-1",
      isSynced: false,
      kind: RICH_LINK_KIND.explicit,
      start: 0,
      url: "https://tutribu.com",
    };
    const nextText = "ab";

    const [adjustedLink] = getLinksAfterTextChange({
      links: [trackedLink],
      nextText,
      previousText: "abcX",
    });

    expect(adjustedLink).toMatchObject({ end: 2, start: 0 });
    expect(nextText.slice(adjustedLink.start, adjustedLink.end)).toBe("ab");
  });
});

describe("getWordDeletionRange", () => {
  it("extends a collapsed caret backward over a word", () => {
    expect(
      getWordDeletionRange({
        direction: RICH_TEXT_EDITOR_WORD_DIRECTION.backward,
        selectionRange: { end: 8, start: 8 },
        text: "el curso",
      })
    ).toEqual({ end: 8, start: 3 });
  });

  it("returns the selection unchanged when text is selected", () => {
    expect(
      getWordDeletionRange({
        direction: RICH_TEXT_EDITOR_WORD_DIRECTION.forward,
        selectionRange: { end: 5, start: 0 },
        text: "el curso",
      })
    ).toEqual({ end: 5, start: 0 });
  });
});

describe("rangesOverlap", () => {
  it("detects overlapping ranges", () => {
    expect(rangesOverlap({ end: 5, start: 0 }, { end: 8, start: 3 })).toBe(true);
  });

  it("treats adjacent ranges as non-overlapping", () => {
    expect(rangesOverlap({ end: 3, start: 0 }, { end: 6, start: 3 })).toBe(
      false
    );
  });
});

describe("isBareUrlMatchInsideEmail", () => {
  it("flags a domain preceded by an @ sign", () => {
    expect(
      isBareUrlMatchInsideEmail({
        content: "hola@tutribu.com",
        matchedIndex: 5,
        matchedUrl: "tutribu.com",
      })
    ).toBe(true);
  });

  it("does not flag an absolute URL", () => {
    expect(
      isBareUrlMatchInsideEmail({
        content: "https://tutribu.com",
        matchedIndex: 0,
        matchedUrl: "https://tutribu.com",
      })
    ).toBe(false);
  });
});

describe("parsePreviewSegments", () => {
  it("renders an explicit link over the plain text", () => {
    const segments = parsePreviewSegments("el curso", [
      {
        end: 8,
        id: "link-1",
        isSynced: false,
        kind: RICH_LINK_KIND.explicit,
        start: 0,
        url: "https://tutribu.com",
      },
    ]);

    expect(segments).toEqual([
      {
        end: 8,
        id: "link-1",
        key: expect.stringContaining(RICH_PREVIEW_LINK_SOURCE.explicit),
        source: RICH_PREVIEW_LINK_SOURCE.explicit,
        start: 0,
        text: "el curso",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com",
      },
    ]);
  });

  it("auto-detects a bare domain as an automatic preview link", () => {
    const segments = parsePreviewSegments("entrá a tutribu.com", []);

    expect(segments).toEqual([
      { text: "entrá a ", type: RICH_TEXT_SEGMENT_TYPE.text },
      {
        end: 19,
        key: expect.stringContaining(RICH_PREVIEW_LINK_SOURCE.automatic),
        source: RICH_PREVIEW_LINK_SOURCE.automatic,
        start: 8,
        text: "tutribu.com",
        type: RICH_TEXT_SEGMENT_TYPE.link,
        url: "https://tutribu.com",
      },
    ]);
  });
});
