# KaneCLI Hackathon submission kit (deadline 26 Nov, 23:59 IST = 19:29 Madrid)

Status: built, not submitted. Nothing below has been posted or sent.

## Before submitting (owner)

1. Register: https://www.kaneclihack.sh/o/register
2. TestMu AI account + 10,000 free credits, same email: https://www.testmuai.com/kane-cli/#creditOffer
3. Sign Kane in on the box once: `kane-cli login --oauth` (or username + access key from TestMu → Settings → Keys).
4. Run `npm run kane`, let the agent fix what Kane catches, rerun to green (this is the demo footage).
5. Add repo secrets `LT_USERNAME`, `LT_ACCESS_KEY` so CI runs Kane too.
6. Publish the video (YouTube, unlisted is fine) and the two posts below, then fill the form at https://www.kaneclihack.sh/o/submit.

## Form answers

**GitHub repository URL**
https://github.com/yayguru/keel-payroll

**About your app**
Keel Payroll is a payroll agent: you tell it "pay Maria (Brazil) $0.10 for the logo" and it pays her in her local
stablecoin, inside caps the owner sets, with a kill switch. Because it moves money, the coding agent that builds it
(Cursor's agent; the same hooks work for Claude Code) is not allowed to say "done" on its own.

Kane CLI is the gate. Nine plain-English Kane tests cover what must never break: an allowlisted payee is paid and
the receipt shows up, a stranger is refused, the daily cap and the kill switch hold, workers see a sane local
quote, a pasted wallet isn't truncated, errors translate when the language changes. When the agent stops, a stop
hook runs Kane on the suites its diff touched; a failure comes back as the agent's next instruction
(`.kane/FEEDBACK.md`: failed step, Kane's reason, the source folders to look in, and "fix the product, never loosen
a money check"). The agent fixes and stops again until Kane signs off. Deploys go to a staging Worker first, Kane
runs against it with `--override-start-url`, and production is only promoted on a pass. CI runs the same tests
with the official kane-cli GitHub Action and comments on PRs.

What Kane caught: <fill after the run, e.g. "a pasted wallet with a leading space lost its last character",
"the on-screen error stayed in English after switching to Portuguese", "'pay Maria $0.10' was not understood
unless the country was repeated">. Each was fixed by the agent from Kane's feedback and the suite went green.

**YouTube demo video URL**
<fill>

**Live URL**
https://keel-desk.merjkerm.workers.dev (agent desk, mock mode: no keys, nothing is signed)
Also: https://keel-jobs.merjkerm.workers.dev (worker sign-up page)

**Launch buzz (2+ public posts)**
<X link>, <LinkedIn or HN link>

**Notes for judges (put in About or README)**
No login is needed for either live URL. To run Kane yourself: `npm i -g @testmuai/kane-cli && kane-cli login`,
then `npm run kane`. Fallback: the recorded run in the video and the Kane share links in the README.

## Demo video script (about 4 min)

Recorded on the box: terminal + browser, captions, ElevenLabs voice-over (existing pipeline in /workspace/keel-video2).

| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | Desk, "pay Maria (Brazil) $0.10 for the logo", receipt in Tape | "This is Keel, a payroll agent. You tell it who to pay, it pays them in their local stablecoin, inside limits you set." |
| 0:20 | Controls tab: caps, Revoke session | "It moves money. So the coding agent that builds it doesn't get to decide when it's done." |
| 0:35 | `kane/tests/desk/*.md` side by side with `kane/requirements/keel-desk.md` | "These are Kane CLI tests. Plain English, written from the requirements: pay the allowlist, refuse strangers, respect the cap, honour the kill switch." |
| 1:00 | Cursor: ask the agent for a small change; agent says done; hook fires; terminal shows `kane-gate: running desk, jobs` | "When the agent stops, a hook runs Kane on whatever its change touched." |
| 1:30 | Kane in the browser (headed), red ✗ on `wallet_paste` / `language_switch` / `pay_known_payee_without_country` | "Kane drives a real browser through the live app. And it finds things. A wallet pasted with a space loses a character. An error stays in English after you switch to Portuguese." |
| 2:10 | `.kane/FEEDBACK.md`, then the agent's next turn quoting it | "The failure goes back to the agent as its next instruction: the step, Kane's reason, where to look, and a rule: fix the product, never loosen a money check." |
| 2:40 | Agent edits `jobs/page.html`, stops again, Kane reruns, all ✓ | "It fixes, stops again, and Kane reruns. Green." |
| 3:05 | `npm run deploy:jobs`: staging URL → Kane vs staging → "promoted" | "Deploys work the same way. Staging first, Kane against staging, production only on a pass." |
| 3:30 | GitHub PR with the Kane Action comment | "And CI runs the same tests on every PR." |
| 3:45 | Live desk URL, repo URL | "Keel Payroll. The agent builds it, Kane signs it off. Links below." |

## Post drafts (need owner approval before posting)

**X**

> My payroll agent isn't allowed to say "done" anymore.
>
> Keel pays people in their local stablecoin. Because it moves money, every change the coding agent makes now goes
> through @testmuai Kane CLI in a real browser first. Fail → the failure becomes the agent's next prompt. Pass → deploy.
>
> Kane caught 3 real bugs on day one. Demo: <video>
> Code: github.com/yayguru/keel-payroll
> #KaneCLIHack

**LinkedIn** (or Show HN: "Show HN: A payroll agent that can't ship until a browser agent signs off")

> I built a payroll agent, Keel: "pay Maria in Brazil $0.10 for the logo" and it pays her in wBRL, inside caps the
> owner sets, with a kill switch.
>
> The interesting part is how it's built. The coding agent that writes Keel can't declare a change finished on its
> own. When it stops, a hook runs Kane CLI (TestMu AI) on the parts of the app the change touched: nine plain-English
> tests that drive a real browser through the live app. Pay the allowlist. Refuse strangers. Respect the daily cap.
> Honour the kill switch. Show workers a sane local quote.
>
> If Kane fails, its report (failed step, reason, where to look) becomes the agent's next instruction, with one rule:
> fix the product, never loosen a money check. Deploys go to staging first and are only promoted when Kane passes.
>
> On the first run Kane found three real bugs I hadn't noticed, including a pasted wallet address losing a character.
> The agent fixed all three from Kane's feedback.
>
> Video: <video> · Code: https://github.com/yayguru/keel-payroll · Live: https://keel-desk.merjkerm.workers.dev
> Built for the KaneCLI hackathon.

Replace "3 real bugs" with the actual count from the run before posting.
