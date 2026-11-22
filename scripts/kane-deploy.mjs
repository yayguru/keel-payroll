#!/usr/bin/env node
// Deploy that refuses to ship until Kane signs off.
//   node scripts/kane-deploy.mjs desk|jobs
// 1. build  2. deploy to a staging Worker  3. run that suite's Kane tests against staging
// 4. promote to production only if Kane passed; otherwise print the brief and stop.
// Needs CLOUDFLARE_API_TOKEN (Workers edit) for wrangler, and a signed-in kane-cli.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const target = process.argv[2];
const T = {
  desk: { dir: "desk-worker", build: "node desk-worker/build.mjs", name: "keel-desk" },
  jobs: { dir: "jobs", build: "node jobs/build.mjs", name: "keel-jobs" },
}[target];
if (!T) { console.error("usage: kane-deploy.mjs desk|jobs"); process.exit(2); }
const root = new URL("..", import.meta.url).pathname;
const sh = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

sh(T.build);
const staging = `${T.name}-staging`;
const out = execSync(`npx wrangler deploy --name ${staging}`, { cwd: `${root}${T.dir}`, encoding: "utf8" });
const url = (out.match(/https:\/\/[^\s]+workers\.dev/) ?? [])[0];
if (!url) { console.error(out); console.error("Could not read the staging URL."); process.exit(3); }
console.log(`staging: ${url}`);

const gate = spawnSync(process.execPath, ["scripts/kane-gate.mjs", "--suite", target, "--url", url], { cwd: root, stdio: "inherit" });
if (gate.status !== 0) {
  console.error(`\nKane did not sign off (exit ${gate.status}). Production was NOT touched.`);
  try { console.error(readFileSync(`${root}.kane/FEEDBACK.md`, "utf8")); } catch {}
  process.exit(1);
}
sh("npx wrangler deploy", `${root}${T.dir}`);
console.log(`Kane signed off on ${url}; promoted ${T.name} to production.`);
