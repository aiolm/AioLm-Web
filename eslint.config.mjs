import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });
const typographyProperty = "/^(font|fontSize|fontFamily|fontWeight|lineHeight|letterSpacing|font-size|font-family|font-weight|line-height|letter-spacing|--(fs|font|lh|fw|tracking)-.*)$/";
const typographyMessage = "Keep typography in CSS using the canonical guide-based tokens in src/theme/typography.css; do not override it inline or through style mutations.";

// ESLint 9 flat config via the supported compatibility layer. The legacy
// `import next from "eslint-config-next"` root cannot be spread into a flat
// array and trips the eslint-patch caller check under ESLint 9.
const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", ".next-dev/**", "out/**", "dist/**", "coverage/**", "tmp/**", ".vercel/**", ".playwright-mcp/**", "next-env.d.ts"],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    // This endpoint renders a fixed 1200×630 social graphic, not a web page.
    ignores: ["src/app/opengraph-image/route.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Property[key.name=${typographyProperty}]`, message: typographyMessage },
        { selector: `Property[key.value=${typographyProperty}]`, message: typographyMessage },
        { selector: `JSXAttribute[name.name=${typographyProperty}]`, message: typographyMessage },
        { selector: `AssignmentExpression[left.property.name=${typographyProperty}]`, message: typographyMessage },
        { selector: `AssignmentExpression[left.property.value=${typographyProperty}]`, message: typographyMessage },
        { selector: `CallExpression[callee.property.name='setProperty'][arguments.0.value=${typographyProperty}]`, message: typographyMessage },
      ],
    },
  },
];

export default config;
