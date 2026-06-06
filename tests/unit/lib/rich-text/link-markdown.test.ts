import {
  deserializeMarkdownForEditor,
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

  it("returns null for empty or whitespace input", () => {
    expect(normalizeMarkdownUrl("   ")).toBeNull();
    expect(normalizeMarkdownUrl(null)).toBeNull();
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
});
