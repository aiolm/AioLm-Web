import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const foundationPath = path.join(root, "src/theme/typography.css");
const tokenPattern = /^--(?:fs|font|lh|fw|tracking)-/;
const propertyFamilies = new Map([
  ["font-size", "--fs-"],
  ["font-family", "--font-"],
  ["font-weight", "--fw-"],
  ["line-height", "--lh-"],
  ["letter-spacing", "--tracking-"],
]);

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await cssFiles(filename));
    else if (entry.isFile() && entry.name.endsWith(".css")) files.push(filename);
  }
  return files;
}

async function checkTypography() {
  const foundation = postcss.parse(await readFile(foundationPath, "utf8"), { from: foundationPath });
  // Derive names from the actual foundation, never a second token/value registry.
  const tokens = new Set();
  foundation.walkDecls((declaration) => {
    if (tokenPattern.test(declaration.prop)) tokens.add(declaration.prop);
  });
  for (const family of propertyFamilies.values()) {
    if (![...tokens].some((token) => token.startsWith(family))) {
      throw new Error(`Typography foundation is missing the ${family} token family.`);
    }
  }

  const errors = [];
  const files = await cssFiles(path.join(root, "src"));
  for (const filename of files) {
    const tree = filename === foundationPath
      ? foundation
      : postcss.parse(await readFile(filename, "utf8"), { from: filename });
    tree.walkDecls((declaration) => {
      const report = (message) => {
        const { line, column } = declaration.source.start;
        errors.push(`${path.relative(root, filename)}:${line}:${column} ${message}`);
      };
      const property = declaration.prop.toLowerCase();
      const value = declaration.value.trim();

      if (tokenPattern.test(declaration.prop) && filename !== foundationPath) {
        report(`${declaration.prop} must be defined only in src/theme/typography.css.`);
      }
      for (const reference of value.matchAll(/var\(\s*(--(?:fs|font|lh|fw|tracking)-[\w-]+)/g)) {
        if (!tokens.has(reference[1])) report(`Unknown typography token ${reference[1]}.`);
      }

      // These are registration descriptors, not page typography declarations.
      const fontFaceDescriptor = declaration.parent.type === "atrule"
        && declaration.parent.name.toLowerCase() === "font-face"
        && (property === "font-family" || property === "font-weight");
      if (fontFaceDescriptor) return;

      if (property === "font") {
        if (value !== "inherit") report('The font shorthand must be "inherit"; use canonical longhand tokens otherwise.');
        return;
      }
      const family = propertyFamilies.get(property);
      if (!family || value === "inherit") return;
      const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
      if (!reference || !reference[1].startsWith(family) || !tokens.has(reference[1])) {
        report(`${property}: ${value} must be inherit or a direct var(${family}…) defined in src/theme/typography.css.`);
      }
    });
  }
  if (errors.length) {
    console.error(`Typography design-system check failed:\n${errors.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Typography design-system check passed (${files.length} CSS files).`);
  }
}

try {
  await checkTypography();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
