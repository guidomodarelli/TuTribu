/** @jest-environment node */

import path from "node:path";
import { pathToFileURL } from "node:url";

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

async function loadModule<T>(relativePath: string): Promise<T> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return (await import(moduleUrl)) as T;
}

async function createMagicStringsEslint() {
  const { default: noMagicStringsRule } = await loadModule<{
    default: object;
  }>("eslint/rules/no-magic-strings.mjs");

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

async function createRepositoryEslint() {
  const { default: eslintConfig } = await loadModule<{ default: object[] }>(
    "eslint.config.mjs"
  );

  return new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: eslintConfig,
  });
}

async function createMagicNumbersEslintWithOptions(ruleOptions: Record<string, unknown>) {
  const { default: noMagicNumbersRule } = await loadModule<{
    default: object;
  }>("eslint/rules/no-magic-numbers.mjs");

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
  it("rejects eslint-disable directives in product code through the repository eslint config", async () => {
    const eslint = await createRepositoryEslint();

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
      "local/no-eslint-disable"
    );
  });

  it("allows visible JSX copy, imports, exports and directives for magic strings", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        "use client";

        import { Button } from "@/components/ui/button";
        export { Button };

        export const COMMUNITY_ROUTES = {
          create: "/comunidad/crear",
        } as const;

        export function CreateCommunityPage() {
          return (
            <main>
              <h1>Crear una comunidad</h1>
              <Button aria-label="Crear comunidad">Guardar</Button>
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
        export function CommunityMenu() {
          return (
            <DropdownMenuContent side="top" align="start">
              <button onClick={() => router.push("/comunidad/crear")}>
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
              return "/comunidad/crear";
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
        export function openCommunity(slug: string) {
          router.push(\`/comunidad/\${slug}\`);
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
          variable: "--font-space-grotesk",
          subsets: ["latin"],
        });

        const ibmPlexMono = IBM_Plex_Mono({
          variable: "--font-ibm-plex-mono",
          subsets: ["latin"],
          weight: ["400", "500"],
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

  it("does not report object keys or property-name access for magic strings", async () => {
    const eslint = await createMagicStringsEslint();

    const [result] = await eslint.lintText(
      `
        const COMMUNITY_STATUS = {
          hidden: "hidden",
        } as const;

        export function readStatus(payload: { status: string }) {
          return payload["status"] === COMMUNITY_STATUS.hidden;
        }
      `,
      {
        filePath: "src/example.ts",
      }
    );

    expect(result.messages).toHaveLength(0);
  });

  it("reports magic numbers in product code through the repository eslint config", async () => {
    const eslint = await createRepositoryEslint();

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

  it("keeps -1, 0 and 1 ignored by default in the repository magic number rule", async () => {
    const eslint = await createRepositoryEslint();

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
    const eslint = await createRepositoryEslint();

    const [result] = await eslint.lintText(
      `
        describe("example", () => {
          it("keeps numeric literals available in tests", () => {
            expect(3000).toBe(3000);
          });
        });
      `,
      {
        filePath: "tests/unit/example.test.ts",
      }
    );

    expect(result.messages).toHaveLength(0);
  });
});
