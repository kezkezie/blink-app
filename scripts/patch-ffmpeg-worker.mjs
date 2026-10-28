// Runs after npm install (package.json "postinstall"), locally and on Vercel.
//
// Next.js 16.4's Turbopack resolves every `new URL(x, import.meta.url)` as a file to bundle, and
// @ffmpeg/ffmpeg 0.12.15 has one with a value known only at run time (a custom worker address,
// `classWorkerURL`), so the build fails with "Module not found: Can't resolve (<dynamic>)".
// BlinkSpot never passes classWorkerURL (components/layout/VideoEditorUI.tsx ensureFfmpeg), so
// that branch becomes a plain `new Worker(classWorkerURL)`; the bundled worker branch is untouched.
// Idempotent, and it says so if the package changed and the line isn't there any more.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const file = new URL("../node_modules/@ffmpeg/ffmpeg/dist/esm/classes.js", import.meta.url);
if (!existsSync(file)) process.exit(0);
const before = "new Worker(new URL(classWorkerURL, import.meta.url), {";
const after = "new Worker(classWorkerURL, {";
const src = readFileSync(file, "utf8");
if (src.includes(after)) process.exit(0);
if (!src.includes(before)) { console.warn("patch-ffmpeg-worker: the line to patch wasn't found; @ffmpeg/ffmpeg may have changed."); process.exit(0); }
writeFileSync(file, src.replace(before, after));
console.log("patch-ffmpeg-worker: patched @ffmpeg/ffmpeg's custom worker branch for Turbopack.");
