import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

// ESLint 9 flat config via the supported compatibility layer. The legacy
// `import next from "eslint-config-next"` root cannot be spread into a flat
// array and trips the eslint-patch caller check under ESLint 9.
const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "dist/**", "coverage/**", "next-env.d.ts"],
  },
];

export default config;
