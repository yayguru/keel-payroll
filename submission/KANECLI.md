# KaneCLI Hackathon submission kit (deadline 26 Nov, 23:59 IST = 19:29 Madrid)

Status: built, Kane runs done (red → fixed → green), demo video rendered. Not submitted; nothing posted.

## Before submitting (owner)

1. Register: https://www.kaneclihack.sh/o/register
2. TestMu AI account + 10,000 free credits, same email: https://www.testmuai.com/kane-cli/#creditOffer
3. ~~Sign Kane in on the box~~ done (OAuth, gadinamark1). ~~Run, fix, rerun to green~~ done.
4. Optional: add repo secrets `LT_USERNAME`, `LT_ACCESS_KEY` (TestMu → Settings → Keys) so the CI workflow runs Kane too.
5. Upload `/workspace/keel-video3/keel-kane-demo.mp4` (69 s) to YouTube (unlisted is fine).
6. Publish the two posts below, then fill the form at https://www.kaneclihack.sh/o/submit.

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

What Kane caught, on its first runs against the live apps: 3 real bugs.
1. Desk: "pay Maria $0.10 for the logo" got a help message instead of a payment, although Maria is on the
   allowlist. The rule parser demanded a country in every payment.
2. Jobs: a wallet address pasted with a leading space was rejected (maxlength=42 cut the last character before trim).
3. Jobs: after an error, switching to Portuguese translated the page but left the error in English.
The agent fixed each one from Kane's report; Kane then passed all 9 tests (desk on staging and production,
jobs on its staging copy, since production sits behind a captcha), and only then were both Workers promoted.
Kane also exposed problems in my own setup that were not app bugs (wrong tab names in the first tests, replays
reopening the originally recorded URL); those are logged honestly in kane/PROGRESS.md.

**YouTube demo video URL**
<fill>

**Live URL**
https://keel-desk.merjkerm.workers.dev (agent desk, mock mode: no keys, nothing is signed)
Also: https://keel-jobs.merjkerm.workers.dev (worker sign-up page; Kane tests https://keel-jobs-staging.merjkerm.workers.dev)

**Launch buzz (2+ public posts)**
<X link>, <LinkedIn or HN link>

**Notes for judges (put in About or README)**
No login is needed for either live URL. To run Kane yourself: `npm i -g @testmuai/kane-cli && kane-cli login`,
then `npm run kane`. Fallback: the recorded run in the video and the Kane share links in the README.

## Demo video (rendered)

`/workspace/keel-video3/keel-kane-demo.mp4`, 69 s, 1280×720, ElevenLabs voice-over, burned-in captions.
Built from real artifacts: Kane's own evidence screenshots of the 3 failures, the real gate output, the real
FEEDBACK.md the stop hook feeds back, the actual fixes, the green reruns, and a live recording of the fixed
production desk. Scene sources: `/workspace/keel-video3/scenes/`, voice script `vo.json`, build `assemble.py`.

## Post drafts (need owner approval before posting)

**X** (≤280 chars)

> My payroll agent can't say "done" anymore.
>
> Every change goes through @testmuai Kane CLI in a real browser. Fail → Kane's report is the agent's next prompt. Pass → deploy.
>
> Kane caught 3 real bugs. Fixed, 9/9 green.
>
> <video>
> github.com/yayguru/keel-payroll
> #KaneCLIHack

**LinkedIn** (or Show HN: "Show HN: A payroll agent that can't ship until a browser agent signs off")

> I built a payroll agent, Keel: "pay Maria $0.10 for the logo" and it pays her in wBRL, inside caps the owner
> sets, with a kill switch.
>
> The interesting part is how it's built. The coding agent that writes Keel can't declare a change finished on its
> own. When it stops, a hook runs Kane CLI (TestMu AI) on the parts of the app the change touched: nine
> plain-English tests that drive a real browser through the live app. Pay the allowlist. Refuse strangers.
> Respect the daily cap. Honour the kill switch. Show workers a sane local quote.
>
> If Kane fails, its report (failed step, reason, where to look) becomes the agent's next instruction, with one
> rule: fix the product, never loosen a money check. Deploys go to staging first and are only promoted when Kane
> passes.
>
> On its first runs Kane found three real bugs: "pay Maria $0.10" without her country got a help message instead
> of a payment; a wallet address pasted with a leading space lost its last character; and an error stayed in
> English after switching the page to Portuguese. The agent fixed all three from Kane's reports, and the suite is
> green on the live desk.
>
> Video: <video> · Code: https://github.com/yayguru/keel-payroll · Live: https://keel-desk.merjkerm.workers.dev
> Built for the KaneCLI hackathon.
