/** @jest-environment node */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

async function loadModule(relativePath) {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(moduleUrl);
}

async function loadNoEslintDisablePlugin() {
  const pluginPath = path.join(
    process.cwd(),
    "node_modules/eslint-plugin-no-eslint-disable/eslint-plugin-no-eslint-disable.mjs"
  );
  const pluginSource = await readFile(pluginPath, "utf8");
  const transformedSource = pluginSource.replace(
    "export { rules };",
    "module.exports = { rules };"
  );
  const sandbox = {
    module: {
      exports: {},
    },
  };

  vm.runInNewContext(transformedSource, sandbox, {
    filename: pluginPath,
  });

  return sandbox.module.exports;
}

async function createMagicStringsEslint() {
  const { default: noMagicStringsRule } = await loadModule(
    "eslint/rules/no-magic-strings.mjs"
  );

  return new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            ecmaFeatures: {
              jsx: true,
            },
          },
        },
        plugins: {
          local: {
            rules: {
              "no-magic-strings": noMagicStringsRule,
            },
          },
        },
        rules: {
          "local/no-magic-strings": "error",
        },
      },
    ],
  });
}

async function createProductRulesEslint() {
  const noEslintDisable = await loadNoEslintDisablePlugin();
  const { default: noMagicNumbersRule } = await loadModule(
    "eslint/rules/no-magic-numbers.mjs"
  );
  const { default: noMagicStringsRule } = await loadModule(
    "eslint/rules/no-magic-strings.mjs"
  );

  return new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: [
          "app/**/*.{ts,tsx}",
          "components/**/*.{ts,tsx}",
          "src/**/*.{ts,tsx}",
          "lib/**/*.{ts,tsx}",
        ],
        ignores: [
          "components/ui/**/*.{ts,tsx}",
          "src/modules/**/infrastructure/**/*.{ts,tsx}",
        ],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            ecmaFeatures: {
              jsx: true,
            },
          },
        },
        plugins: {
          "no-eslint-disable": noEslintDisable,
          local: {
            rules: {
              "no-magic-numbers": noMagicNumbersRule,
              "no-magic-strings": noMagicStringsRule,
            },
          },
        },
        rules: {
          "no-eslint-disable/no-eslint-disable": "error",
          "local/no-magic-numbers": "error",
          "local/no-magic-strings": "error",
        },
      },
    ],
  });
}

async function createMagicNumbersEslintWithOptions(ruleOptions) {
  const { default: noMagicNumbersRule } = await loadModule(
    "eslint/rules/no-magic-numbers.mjs"
  );

  return new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            ecmaFeatures: {
              jsx: true,
            },
          },
        },
        plugins: {
          local: {
            rules: {
              "no-magic-numbers": noMagicNumbersRule,
            },
          },
        },
        rules: {
          "local/no-magic-numbers": ["error", ruleOptions],
        },
      },
    ],
  });
}

describe("magic values lint rules", () => {
  it("rejects eslint-disable directives in product code through the product lint rules", async () => {
    const eslint = await createProductRulesEslint();

    const [result] = await eslint.lintText(
      `
        export function waitForRetry(run: () => void) {
          // eslint-disable-next-line local/no-magic-numbers
          setTimeout(run, 3000);
        }
      `,
      {
        filePath: "src/modules/example.ts",
      }
    );

    expect(result.messages.map((message) => message.ruleId)).toContain(
      "no-eslint-disable/no-eslint-disable"
    );
  });

  it("allows visible JSX copy, imports, exports and directives for magic strings", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        "use client";

        import { Button } from "@/components/ui/button";
        export { Button };

        export const TRIBE_ROUTES = {
          create: "/-/crear",
        } as const;

        export function CreateTribePage() {
          return (
            <main>
              <h1>Crear una tribu</h1>
              <Button aria-label="Crear tribu">Guardar</Button>
              <p>{"Texto visible"}</p>
            </main>
          );
        }
      `,
      {
        filePath: "src/example.tsx",
      }
    );

    expect(result.messages).toHaveLength(0);
  });

  it("rejects behavioral strings inside JSX props and handlers", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        export function TribeMenu() {
          return (
            <DropdownMenuContent side="top" align="start">
              <button onClick={() => router.push("/-/crear")}>
                Abrir
              </button>
            </DropdownMenuContent>
          );
        }
      `,
      {
        filePath: "src/example.tsx",
      }
    );

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((message) => message.ruleId)).toEqual([
      "local/no-magic-strings",
      "local/no-magic-strings",
      "local/no-magic-strings",
    ]);
  });

  it("rejects inline strings used as statuses, routes and error/control messages", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        export function resolveAccess(status: string) {
          if (status === "hidden") {
            throw new Error("unexpected_repository_error");
          }

          switch (status) {
            case "created":
              return "/-/crear";
            default:
              return null;
          }
        }
      `,
      {
        filePath: "src/example.ts",
      }
    );

    expect(result.messages).toHaveLength(4);
    expect(result.messages.map((message) => message.ruleId)).toEqual([
      "local/no-magic-strings",
      "local/no-magic-strings",
      "local/no-magic-strings",
      "local/no-magic-strings",
    ]);
  });

  it("rejects no-substitution template literals used as control values", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        export function resolveAccess(status: string) {
          return status === \`hidden\`;
        }
      `,
      {
        filePath: "src/example.ts",
      }
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.ruleId).toBe("local/no-magic-strings");
  });

  it("rejects template literals with static text used in behavioral code", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        export function openTribe(slug: string) {
          router.push(\`/\${slug}\`);
        }
      `,
      {
        filePath: "src/example.tsx",
      }
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.ruleId).toBe("local/no-magic-strings");
  });

  it("allows inline string values inside next/font loader calls", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

        const spaceGrotesk = Space_Grotesk({
          variable: "--font-sans",
          subsets: ["latin"],
          weight: ["400", "500", "600", "700"],
        });

        const ibmPlexMono = IBM_Plex_Mono({
          variable: "--font-mono",
          subsets: ["latin"],
          weight: ["400", "500", "600"],
        });

        export const fonts = {
          ibmPlexMono,
          spaceGrotesk,
        };
      `,
      {
        filePath: "app/layout.tsx",
      }
    );

    expect(result.messages).toHaveLength(0);
  });

  it("allows inline SVG markup strings for custom icons", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        export function TotemIcon(props: React.SVGProps<SVGSVGElement>) {
          return (
            <svg
              {...props}
              aria-hidden="true"
              className={["lucide", "lucide-totem", props.className].filter(Boolean).join(" ")}
              fill="none"
              height="24"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8 4h8" />
            </svg>
          );
        }
      `,
      {
        filePath: "components/example.tsx",
      }
    );

    expect(result.messages).toHaveLength(0);
  });

  it("does not report object keys or property-name access for magic strings", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        const TRIBE_STATUS = {
          hidden: "hidden",
        } as const;

        export function readStatus(payload: { status: string }) {
          return payload["status"] === TRIBE_STATUS.hidden;
        }
      `,
      {
        filePath: "src/example.ts",
      }
    );

    expect(result.messages).toHaveLength(0);
  });

  it("reports magic numbers in product code through the product lint rules", async () => {
    const eslint = await createProductRulesEslint();

    const [result] = await eslint.lintText(
      `
        export function waitForRetry(run: () => void) {
          setTimeout(run, 3000);
        }
      `,
      {
        filePath: "src/modules/example.ts",
      }
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.ruleId).toBe("local/no-magic-numbers");
  });

  it("keeps -1, 0 and 1 ignored by default in the product magic number rule", async () => {
    const eslint = await createProductRulesEslint();

    const [result] = await eslint.lintText(
      `
        export function normalizeIndex(index: number) {
          return index === -1 ? 0 : 1;
        }
      `,
      {
        filePath: "src/modules/example.ts",
      }
    );

    expect(result.messages).toHaveLength(0);
  });

  it("extends default ignored numbers when custom ignore values are provided", async () => {
    const eslint = await createMagicNumbersEslintWithOptions({
      ignore: [2],
    });

    const [result] = await eslint.lintText(
      `
        export function normalizeIndex(index: number) {
          return index === -1 ? 0 : index === 1 ? 2 : 3;
        }
      `,
      {
        filePath: "src/modules/example.ts",
      }
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.ruleId).toBe("local/no-magic-numbers");
  });

  it("allows disabling the default ignored numbers through a boolean option", async () => {
    const eslint = await createMagicNumbersEslintWithOptions({
      useDefaultIgnore: false,
    });

    const [result] = await eslint.lintText(
      `
        export function normalizeIndex(index: number) {
          return index === -1 ? 0 : 1;
        }
      `,
      {
        filePath: "src/modules/example.ts",
      }
    );

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((message) => message.ruleId)).toEqual([
      "local/no-magic-numbers",
      "local/no-magic-numbers",
      "local/no-magic-numbers",
    ]);
  });

  it("does not apply the magic number rule to test files", async () => {
    const eslint = await createProductRulesEslint();

    const results = await eslint.lintText(
      `
        describe("example", () => {
          it("keeps numeric literals available in tests", () => {
            expect(3000).toBe(3000);
          });
        });
      `,
      {
        filePath: "tests/unit/example.test.ts",
        warnIgnored: false,
      }
    );

    expect(results).toHaveLength(0);
  });
});
