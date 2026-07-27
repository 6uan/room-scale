import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  {
    // Domain modules must stay pure: no React, no rendering, no browser storage.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-dom",
                "next",
                "next/*",
                "zustand",
                "zustand/*",
                "three",
                "@react-three/*",
                "dexie",
                "@/state/*",
                "@/scene/*",
                "@/persistence/*",
                "@/components/*",
                "@/app/*",
              ],
              message:
                "Domain modules must remain pure. See AGENTS.md > Architecture.",
            },
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The end-to-end build, which writes here so it cannot clobber the dev one.
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // RoomScale additions:
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
