#!/usr/bin/env node
/**
 * Pads any PNG to 1024×1024 on a transparent background (centered).
 *
 * Usage:
 *   node scripts/normalize-image.js <source.png> [dest-path] [output-filename]
 *
 * Examples:
 *   node scripts/normalize-image.js ~/Downloads/icon.png
 *   node scripts/normalize-image.js ~/Downloads/icon.png public/icon.png
 *   node scripts/normalize-image.js ~/Downloads/icon.png public/ app-icon.png
 *
 * Defaults:
 *   dest-path      → public/
 *   output-filename → inferred from source filename (lowercased, spaces → underscores)
 *
 * Requirements: sharp  (listed in devDependencies — run npm install first)
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const TARGET_SIZE = 1024;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const [, , sourcePath, destArg, filenameArg] = process.argv;

if (!sourcePath) {
  console.error(
    "Usage: node scripts/normalize-image.js <source.png> [dest-path] [output-filename]"
  );
  process.exit(1);
}

const absSource = path.resolve(sourcePath);
if (!fs.existsSync(absSource)) {
  console.error(`File not found: ${absSource}`);
  process.exit(1);
}

const inferredName =
  path.basename(absSource, path.extname(absSource)).toLowerCase().replace(/\s+/g, "_") + ".png";

let destPath;
if (!destArg) {
  destPath = path.join(ROOT, "public", inferredName);
} else if (filenameArg) {
  destPath = path.resolve(destArg, filenameArg);
} else if (destArg.endsWith("/") || destArg.endsWith(path.sep) || !path.extname(destArg)) {
  destPath = path.resolve(destArg, inferredName);
} else {
  destPath = path.resolve(destArg);
}

async function run() {
  const meta = await sharp(absSource).metadata();
  console.log(`Source: ${absSource}`);
  console.log(`  ${meta.width}×${meta.height} px  (${meta.format})`);

  const result = await sharp(absSource)
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, result);

  console.log(`  → ${path.relative(ROOT, destPath)}`);
  console.log(`Done. Output: ${TARGET_SIZE}×${TARGET_SIZE} transparent PNG`);
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
