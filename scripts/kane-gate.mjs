#!/usr/bin/env node
// Kane gate: run the Kane CLI suites that matter, then write what failed in a form a coding agent can act on.
//
//   node scripts/kane-gate.mjs                      # every suite against the live URLs in each test
//   node scripts/kane-gate.mjs --tags smoke         # only tests tagged smoke
//   node scripts/kane-gate.mjs --changed            # only suites whose source changed (git diff vs HEAD)
//   node scripts/kane-gate.mjs --suite desk --url https://keel-desk-staging.example.workers.dev
//
// Exit 0 = Kane signed off. Exit 1 = Kane found a failure (see .kane/FEEDBACK.md). Exit 3 = Kane could not run.
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, ".kane");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

// Which source paths each suite guards. The agent reads this to know where to look when a suite fails.
export const SUITES = {
  desk: { tests: "kane/tests/desk", sources: ["components/", "lib/", "app/", "desk-worker/"] },
  // Production keel-jobs sits behind Cloudflare Turnstile, which a test browser must not solve. Kane checks the
  // staging copy (same code, own D1 database, no captcha) and a deploy is promoted only after that passes.
  jobs: { tests: "kane/tests/jobs", sources: ["jobs/"], url: "https://keel-jobs-staging.merjkerm.workers.dev" },
};

function changedSuites() {
  let files = [];
  try {
    files = execSync("git diff --name-only HEAD; git ls-files --others --exclude-standard", { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return Object.keys(SUITES);
  }
  return Object.entries(SUITES)
    .filter(([, s]) => files.some((f) => f.startsWith(s.tests) || s.sources.some((p) => f.startsWith(p))))
    .map(([name]) => name);
}

let suites = opt("--suite") ? [opt("--suite")] : flag("--changed") ? changedSuites() : Object.keys(SUITES);
if (suites.length === 0) {
  console.log("kane-gate: nothing Kane guards has changed. Skipping.");
  process.exit(0);
}

function testFiles(dir) {
  const abs = join(root, dir);
  return existsSync(abs) ? readdirSync(abs).filter((f) => f.endsWith("_test.md")).map((f) => join(dir, f)) : [];
}

function lastEvents(logPath, n = 40) {
  try {
    return readFileSync(logPath, "utf8").trim().split("\n").slice(-n).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function runSuite(name) {
  return new Promise((resolve) => {
    const files = testFiles(SUITES[name].tests);
    const cli = ["testrun", "run", ...files, "--agent", "--name", `keel-${name}`, "--parallel", process.env.KANE_PARALLEL ?? "3"];
    if (opt("--tags")) cli.push("--tags", opt("--tags"));
    // Replays open the URL a test was first recorded on, so a target is always passed explicitly.
    const target = opt("--url") ?? SUITES[name].url;
    if (target) cli.push("--override-start-url", target, "--local");
    const child = spawn("kane-cli", cli, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, KANE_CLI_USER_AGENT: process.env.KANE_CLI_USER_AGENT ?? "keel-kane-gate" },
    });
    const result = { suite: name, members: [], summary: null, status: "error", evidence: null, stderr: "" };
    let buf = "";
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "testrun_member_end" || ev.type === "testrun_authored_member_end") {
          result.members.push(ev);
          console.log(`  ${ev.status === "passed" ? "✓" : "✗"} ${relative(root, ev.path)} (${ev.duration_s ?? "?"}s)`);
        } else if (ev.type === "testrun_summary") result.summary = ev;
        else if (ev.type === "testrun_done") result.status = ev.overall_status;
        else if (ev.type === "error") result.stderr += `${ev.message ?? JSON.stringify(ev)}\n`;
      }
    });
    child.stderr.on("data", (chunk) => {
      const s = String(chunk);
      result.stderr += s;
      const m = s.match(/evidence serve ([^\s`]+)/);
      if (m) result.evidence = m[1];
    });
    child.on("close", (code) => resolve({ ...result, exit: code }));
    child.on("error", (err) => resolve({ ...result, exit: 127, stderr: String(err) }));
  });
}

console.log(`kane-gate: running ${suites.map((n) => `${n}${(opt("--url") ?? SUITES[n]?.url) ? ` (${opt("--url") ?? SUITES[n].url})` : ""}`).join(", ")}`);
const results = [];
for (const name of suites) results.push(await runSuite(name));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));

const notAuthed = results.some((r) => /not authenticated|kane-cli login/i.test(r.stderr));
const failed = results.flatMap((r) => r.members.filter((m) => m.status !== "passed").map((m) => ({ ...m, suite: r.suite })));
const broken = results.filter((r) => r.status === "error" || (r.exit !== 0 && r.members.length === 0));

if (notAuthed || (broken.length && !failed.length)) {
  const why = notAuthed ? "Kane CLI is not signed in. Run `kane-cli login --oauth` once." : broken.map((r) => r.stderr.trim()).join("\n");
  writeFileSync(join(outDir, "FEEDBACK.md"), `# Kane could not run\n\n${why}\n`);
  console.error(`kane-gate: Kane could not run.\n${why}`);
  process.exit(3);
}

if (failed.length === 0) {
  writeFileSync(join(outDir, "FEEDBACK.md"), `# Kane signed off\n\n${results.map((r) => `- ${r.suite}: ${r.members.length} passed`).join("\n")}\n`);
  writeFileSync(join(outDir, "last-green"), new Date().toISOString());
  console.log("kane-gate: Kane signed off ✓");
  process.exit(0);
}

// Failure: write a brief the coding agent can act on without reading raw logs.
const lines = [
  "# Kane CLI found failures. Fix the product, then rerun `npm run kane`.",
  "",
  "Rules for the agent:",
  "- The tests in `kane/tests/` encode the requirements in `kane/requirements/`. Change the app, not the test,",
  "  unless the requirement itself is wrong (then say so to the owner instead of editing the test).",
  "- Each failure below names the suite's source folders. Start there.",
  "- Never weaken a money or safety check (allowlist, caps, revoke) to make a test pass.",
  "",
];
for (const m of failed) {
  const rel = relative(root, m.path);
  const testText = readFileSync(m.path, "utf8");
  const tail = lastEvents(m.log_path).filter((e) => ["run_end", "step_end", "assertion", "test_md_done", "error"].includes(e.type));
  const detail = tail.map((e) => e.summary || e.reason || e.message).filter(Boolean).slice(-4);
  lines.push(`## ✗ ${rel} (${m.status})`);
  lines.push(`- Suite: **${m.suite}**, sources: ${SUITES[m.suite].sources.map((s) => `\`${s}\``).join(", ")}`);
  if (m.failure) lines.push(`- Kane says: ${m.failure.message}${m.failure.step_index != null ? ` (step ${m.failure.step_index + 1})` : ""}`);
  for (const d of detail) lines.push(`- Detail: ${d}`);
  if (m.log_path) lines.push(`- Full log: \`${m.log_path}\``);
  lines.push("", "<details><summary>Test</summary>", "", "```markdown", testText.trim(), "```", "", "</details>", "");
}
const ev = results.map((r) => r.evidence).filter(Boolean);
if (ev.length) lines.push(`Evidence: ${ev.map((p) => `\`kane-cli evidence serve ${p}\``).join(", ")}`);
writeFileSync(join(outDir, "FEEDBACK.md"), lines.join("\n") + "\n");
console.error(`kane-gate: ${failed.length} failing check(s). Brief for the agent: .kane/FEEDBACK.md`);
process.exit(1);
