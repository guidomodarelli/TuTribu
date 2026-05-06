const DIRECTIVE_LITERALS = new Set(["use client", "use server"]);
const TYPEOF_RESULT_LITERALS = new Set([
  "bigint",
  "boolean",
  "function",
  "number",
  "object",
  "string",
  "symbol",
  "undefined",
]);
const USER_FACING_JSX_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "label",
  "placeholder",
  "title",
]);
const NEXT_FONT_IMPORT_SOURCE_PREFIX = "next/font/";
const SVG_ELEMENT_NAMES = new Set([
  "circle",
  "ellipse",
  "g",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "svg",
]);

function getParent(node) {
  return node.parent ?? null;
}

function isNonEmptyStringLiteral(node) {
  return typeof node.value === "string" && node.value.length > 0;
}

function hasStaticTemplateText(node) {
  return node.quasis.some((quasi) => quasi.value.cooked?.length > 0);
}

function isImportedFromNextFont(callExpression, calleeName) {
  let current = callExpression;

  while (current) {
    const program = getParent(current);

    if (!program) {
      return false;
    }

    current = program;

    if (current.type !== "Program") {
      continue;
    }

    return current.body.some((statement) => {
      if (statement.type !== "ImportDeclaration") {
        return false;
      }

      if (!statement.source.value.startsWith(NEXT_FONT_IMPORT_SOURCE_PREFIX)) {
        return false;
      }

      return statement.specifiers.some((specifier) => {
        if (specifier.type === "ImportSpecifier") {
          return specifier.local.name === calleeName;
        }

        if (specifier.type === "ImportDefaultSpecifier") {
          return specifier.local.name === calleeName;
        }

        return false;
      });
    });
  }

  return false;
}

function isInsideNextFontLoaderCall(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);

    if (!parent) {
      return false;
    }

    if (
      parent.type === "CallExpression" &&
      parent.arguments.includes(current) &&
      parent.callee.type === "Identifier"
    ) {
      return isImportedFromNextFont(parent, parent.callee.name);
    }

    current = parent;
  }

  return false;
}

function isVisibleJsxCopyLiteral(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);

    if (!parent) {
      return false;
    }

    if (
      parent.type === "JSXAttribute" &&
      parent.value === current &&
      parent.name?.type === "JSXIdentifier"
    ) {
      return (
        parent.name.name === "className" ||
        USER_FACING_JSX_ATTRIBUTES.has(parent.name.name)
      );
    }

    if (
      parent.type === "JSXExpressionContainer" &&
      parent.parent?.type !== "JSXAttribute"
    ) {
      return true;
    }

    current = parent;
  }

  return false;
}

function isSvgElementName(nameNode) {
  return nameNode?.type === "JSXIdentifier" && SVG_ELEMENT_NAMES.has(nameNode.name);
}

function isInsideSvgOpeningElement(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);

    if (!parent) {
      return false;
    }

    if (
      parent.type === "JSXOpeningElement" &&
      isSvgElementName(parent.name)
    ) {
      return true;
    }

    current = parent;
  }

  return false;
}

function isSvgMarkupLiteral(node) {
  let current = node;

  while (current) {
    const parent = getParent(current);

    if (!parent) {
      return false;
    }

    if (
      parent.type === "JSXAttribute" &&
      isInsideSvgOpeningElement(parent)
    ) {
      return true;
    }

    current = parent;
  }

  return false;
}

function isDirectiveLiteral(node) {
  return (
    getParent(node)?.type === "ExpressionStatement" &&
    DIRECTIVE_LITERALS.has(node.value)
  );
}

function isImportOrExportSource(node) {
  const parentType = getParent(node)?.type;

  return (
    parentType === "ImportDeclaration" ||
    parentType === "ExportAllDeclaration" ||
    parentType === "ExportNamedDeclaration" ||
    parentType === "ImportExpression"
  );
}

function isTypeofComparisonLiteral(node) {
  if (getParent(node)?.type !== "BinaryExpression") {
    return false;
  }

  if (!TYPEOF_RESULT_LITERALS.has(node.value)) {
    return false;
  }

  return (
    node.parent.left?.type === "UnaryExpression" &&
    node.parent.left.operator === "typeof"
  ) || (
    node.parent.right?.type === "UnaryExpression" &&
    node.parent.right.operator === "typeof"
  );
}

function isTypeOnlyLiteral(node) {
  return getParent(node)?.type === "TSLiteralType";
}

function isObjectKey(node) {
  const parent = getParent(node);

  return parent?.type === "Property" && parent.key === node && !parent.computed;
}

function isMemberPropertyName(node) {
  const parent = getParent(node);

  return parent?.type === "MemberExpression" && parent.property === node;
}

function isContainerNode(parent, current) {
  if (
    parent.type === "Property" &&
    parent.value === current
  ) {
    return true;
  }

  return (
    parent.type === "ArrayExpression" ||
    parent.type === "ObjectExpression" ||
    parent.type === "TSAsExpression" ||
    parent.type === "TSSatisfiesExpression"
  );
}

function isExtractedConstantLiteral(node) {
  let current = node;

  while (getParent(current)) {
    const parent = getParent(current);

    if (parent.type === "ExportNamedDeclaration") {
      current = parent;
      continue;
    }

    if (parent.type === "VariableDeclarator" && parent.init === current) {
      return parent.parent?.type === "VariableDeclaration" && parent.parent.kind === "const";
    }

    if (!isContainerNode(parent, current)) {
      return false;
    }

    current = parent;
  }

  return false;
}

function shouldIgnoreStringLikeNode(node) {
  return (
    isImportOrExportSource(node) ||
    isTypeOnlyLiteral(node) ||
    isVisibleJsxCopyLiteral(node) ||
    isSvgMarkupLiteral(node) ||
    isObjectKey(node) ||
    isMemberPropertyName(node) ||
    isExtractedConstantLiteral(node) ||
    isInsideNextFontLoaderCall(node)
  );
}

const noMagicStringsRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow inline string literals used as behavior values instead of named constants or config",
    },
    schema: [],
    messages: {
      noMagicString:
        "Extract this string literal into a named constant or configuration value.",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (!isNonEmptyStringLiteral(node)) {
          return;
        }

        if (
          isDirectiveLiteral(node) ||
          isTypeofComparisonLiteral(node) ||
          shouldIgnoreStringLikeNode(node)
        ) {
          return;
        }

        context.report({
          node,
          messageId: "noMagicString",
        });
      },
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && node.quasis.length === 1) {
          const [quasi] = node.quasis;

          if (!quasi.value.cooked || quasi.value.cooked.length === 0) {
            return;
          }
        } else if (!hasStaticTemplateText(node)) {
          return;
        }

        if (shouldIgnoreStringLikeNode(node)) {
          return;
        }

        context.report({
          node,
          messageId: "noMagicString",
        });
      },
    };
  },
};

export default noMagicStringsRule;
