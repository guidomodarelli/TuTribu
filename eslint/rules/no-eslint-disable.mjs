const ESLINT_DISABLE_DIRECTIVE_PATTERN = /(?:^|\s)eslint-disable(?:$|\s|-)/u;

function isEslintDisableDirective(comment) {
  return ESLINT_DISABLE_DIRECTIVE_PATTERN.test(comment.value);
}

const noEslintDisableRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow eslint-disable comments in product code.",
    },
    schema: [],
    messages: {
      noEslintDisable: "Remove this eslint-disable directive.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (!isEslintDisableDirective(comment)) {
            continue;
          }

          context.report({
            loc: comment.loc,
            messageId: "noEslintDisable",
          });
        }
      },
    };
  },
};

export default noEslintDisableRule;
