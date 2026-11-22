// Bundles page.html and admin.html into dist/worker.js (one ES module, no deps).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const src = readFileSync(dir + "worker.js", "utf8");
const page = readFileSync(dir + "page.html", "utf8");
const admin = readFileSync(dir + "admin.html", "utf8");
mkdirSync(dir + "dist", { recursive: true });
writeFileSync(dir + "dist/worker.js", `${src}\nconst PAGE = ${JSON.stringify(page)};\nconst ADMIN = ${JSON.stringify(admin)};\n`);
console.log("dist/worker.js", (src.length + page.length + admin.length) / 1024 | 0, "KB");
