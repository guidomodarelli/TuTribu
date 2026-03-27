import tseslint from "typescript-eslint";

const DEFAULT_IGNORE_NUMBERS = [-1, 0, 1];
const baseRule = tseslint.plugin.rules["no-magic-numbers"];
const USE_DEFAULT_IGNORES_OPTION = "useDefaultIgnore";
const [baseSchema = {}] = baseRule.meta?.schema ?? [];
const baseSchemaProperties = baseSchema.properties ?? {};

function buildOptions(options = {}) {
  const useDefaultIgnore = options[USE_DEFAULT_IGNORES_OPTION] ?? true;
  const customIgnore = Array.isArray(options.ignore) ? options.ignore : [];
  const ignore = useDefaultIgnore
    ? [...new Set([...DEFAULT_IGNORE_NUMBERS, ...customIgnore])]
    : customIgnore;

  return {
    ...options,
    enforceConst: options.enforceConst ?? true,
    ignore,
  };
}

const noMagicNumbersRule = {
  ...baseRule,
  meta: {
    ...baseRule.meta,
    schema: [
      {
        ...baseSchema,
        properties: {
          ...baseSchemaProperties,
          [USE_DEFAULT_IGNORES_OPTION]: {
            type: "boolean",
          },
        },
      },
    ],
  },
  create(context) {
    const wrappedContext = Object.create(context, {
      options: {
        value: [buildOptions(context.options[0])],
      },
    });

    return baseRule.create(wrappedContext);
  },
};

export default noMagicNumbersRule;
