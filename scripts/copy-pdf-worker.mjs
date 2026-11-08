// Serves the PDF text-extraction worker from this origin, as the CSP requires.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
copyFileSync(join(root, "build", "pdf.worker.min.mjs"), join(import.meta.dirname, "..", "public", "pdf.worker.min.mjs"));
