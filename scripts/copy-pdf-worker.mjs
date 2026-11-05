// Copies pdf.js's worker into public/ so the takeoff can load it from /pdf.worker.min.mjs (runs before dev and build).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
mkdirSync("public", { recursive: true });
copyFileSync(src, join("public", "pdf.worker.min.mjs"));
console.log("pdf.js worker copied to public/pdf.worker.min.mjs");
