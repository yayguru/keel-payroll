// Builds dist/worker.js: Next.js static export of the desk + the two API routes as a Worker.
// Usage: node desk-worker/build.mjs   (then deploy dist/worker.js, see README.md)
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = join(here, ".build");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
for (const entry of ["app", "components", "lib", "public", "components.json", "package.json", "tsconfig.json", "postcss.config.mjs"]) {
  const src = join(root, entry);
  if (existsSync(src)) cpSync(src, join(tmp, entry), { recursive: true, filter: (p) => !p.includes("forge-std") });
}
symlinkSync(join(root, "node_modules"), join(tmp, "node_modules"));
rmSync(join(tmp, "app", "api"), { recursive: true, force: true }); // served by the Worker instead
writeFileSync(
  join(tmp, "next.config.ts"),
  `import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "export", images: { unoptimized: true },
  turbopack: { root: ${JSON.stringify(root)}, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } } };
export default nextConfig;\n`,
);
execSync("npx next build", { cwd: tmp, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".json": "application/json",
  ".woff2": "font/woff2", ".woff": "font/woff" };
const TEXT = new Set([".html", ".js", ".css", ".svg", ".txt", ".json"]);
const out = join(tmp, "out");
const assets = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const ext = extname(name);
    const key = "/" + relative(out, p).split("\\").join("/");
    if (key.endsWith(".txt") && key !== "/robots.txt") continue; // RSC payloads; not needed for a static desk
    const type = TYPES[ext] ?? "application/octet-stream";
    assets[key] = TEXT.has(ext) ? { type, body: readFileSync(p, "utf8") } : { type, body: readFileSync(p).toString("base64"), b64: true };
  }
})(out);
writeFileSync(join(here, "assets.generated.js"), `export const ASSETS = ${JSON.stringify(assets)};\n`);
mkdirSync(join(here, "dist"), { recursive: true });
execSync(
  `npx esbuild ${join(here, "worker.ts")} --bundle --format=esm --platform=browser --target=es2022 --minify ` +
    `--define:process.env='{}' --outfile=${join(here, "dist", "worker.js")}`,
  { cwd: root, stdio: "inherit" },
);
console.log(`assets: ${Object.keys(assets).length}, worker: ${(statSync(join(here, "dist", "worker.js")).size / 1024).toFixed(0)} KiB`);
