#!/usr/bin/env node
// Agent stop hook: when the coding agent says it's done, Kane checks the suites the change touched.
// A failure goes straight back to the agent as its next instruction, so it keeps fixing until Kane signs off.
//   Cursor:      .cursor/hooks.json  -> `node scripts/kane-hook.mjs cursor`   (reply: {"followup_message": ...})
//   Claude Code: .claude/settings.json Stop hook -> `node scripts/kane-hook.mjs claude` (reply: {"decision":"block",...})
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const host = process.argv[2] ?? "cursor";
let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch {}
const MAX_ROUNDS = Number(process.env.KANE_HOOK_MAX_ROUNDS ?? 3);
const round = Number(input.loop_count ?? 0);
if (input.stop_hook_active && host === "claude" && round >= MAX_ROUNDS) process.exit(0);
if (round >= MAX_ROUNDS) process.exit(0);

const root = new URL("..", import.meta.url).pathname;
const gate = spawnSync(process.execPath, [`${root}scripts/kane-gate.mjs`, "--changed"], { cwd: root, encoding: "utf8" });
process.stderr.write(gate.stdout + gate.stderr);
if (gate.status === 0 || gate.status === 3) process.exit(0); // green, or Kane unavailable: never trap the agent

const brief = readFileSync(`${root}.kane/FEEDBACK.md`, "utf8");
const message = `Kane CLI ran the end-to-end checks for what you changed and they failed. Fix it and finish again.\n\n${brief}`;
if (host === "claude") process.stdout.write(JSON.stringify({ decision: "block", reason: message }));
else process.stdout.write(JSON.stringify({ followup_message: message }));
