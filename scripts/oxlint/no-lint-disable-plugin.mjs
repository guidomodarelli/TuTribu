/**
 * Matches every inline directive that silences lint rules. oxlint honors both the
 * `eslint-disable*` and the `oxlint-disable*` spellings, so both must be rejected.
 */
const LINT_DISABLE_DIRECTIVE_PATTERN = /\b(?:es|ox)lint-disable(?:-next-line|-line)?\b/;

/** Rejects comments that disable lint rules instead of fixing the reported code. */
const noLintDisableRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow disabling lint rules through eslint-disable or oxlint-disable comments",
    },
    messages: {
      lintDisableDirective:
        "Disabling lint rules with comments is not allowed; fix the reported code instead.",
    },
    schema: [],
  },
  create(context) {
    for (const comment of context.sourceCode.getAllComments()) {
      if (LINT_DISABLE_DIRECTIVE_PATTERN.test(comment.value)) {
        context.report({ loc: comment.loc, messageId: "lintDisableDirective" });
      }
    }
    return {};
  },
};

/** Repository-owned oxlint JS plugin loaded from `.oxlintrc.json`. */
const noLintDisablePlugin = {
  meta: { name: "no-lint-disable" },
  rules: { "no-lint-disable": noLintDisableRule },
};

export default noLintDisablePlugin;
