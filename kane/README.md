# Kane gate: the payroll agent can't ship (or pay) until Kane signs off

Keel Payroll moves real money for a coding agent's boss. So the coding agent that builds Keel does not get to
say "done" on its own: [Kane CLI](https://www.testmuai.com/kane-cli/) drives a real browser through the live app
and decides.

```
 coding agent edits code ──► says "done" ──► stop hook runs Kane on the suites the diff touched
        ▲                                              │
        │        .kane/FEEDBACK.md (failed step,       │ fail
        └──────── Kane's reason, source folders) ◄─────┘
                                                       │ pass
 npm run deploy:desk ─► staging Worker ─► Kane vs staging ─► promote to production (only on pass)
```

## What Kane checks

| Suite | Test | Guards |
|---|---|---|
| desk | `pay_allowlisted` (smoke) | an allowlisted payee is paid, receipt lands in Receipts, the Today meter moves |
| desk | `pay_known_payee_without_country` | "pay Maria $0.10" works without repeating her country |
| desk | `refuse_unknown_payee` (smoke) | a stranger is refused and nothing is paid |
| desk | `daily_cap` | after the owner lowers the daily cap, the payment that would cross it is refused |
| desk | `kill_switch` | after "Revoke session" every payment is refused |
| jobs | `local_quote` (smoke) | a worker sees a sane local-currency quote (wBRL, cNGN) |
| jobs | `wallet_paste` | a pasted wallet with a stray space is kept whole, a short one is rejected |
| jobs | `language_switch` | switching language translates the error already on screen |
| jobs | `safety_note` | no secret inputs; the seed-phrase warning shows in EN, PT and ES |

Tests are plain English (`kane/tests/**/*_test.md`), written from the use-cases in `kane/requirements/`.
`npm run kane:design` feeds those requirements to Kane's assurance flow to propose more.

## Run it

```bash
npm i -g @testmuai/kane-cli && kane-cli login --oauth   # once
npm run kane          # every suite against the live URLs
npm run kane:smoke    # tests tagged smoke
npm run kane:changed  # only suites whose source changed
npm run deploy:desk   # build, deploy staging, Kane gate, promote (needs CLOUDFLARE_API_TOKEN)
```

Exit codes: `0` Kane signed off, `1` Kane found failures (brief in `.kane/FEEDBACK.md`, raw in `.kane/report.json`),
`3` Kane could not run (not signed in, no credits). The stop hook never traps the agent on `3`.

## Agent wiring

- Cursor: `.cursor/hooks.json` (`stop` hook, `followup_message`, max 3 rounds)
- Claude Code: `.claude/settings.json` (`Stop` hook, `decision: block`)
- CI: `.github/workflows/kane.yml` runs the same tests on push, PRs and nightly with the official
  `kane-cli-browser-run` action and comments the result on PRs (secrets `LT_USERNAME`, `LT_ACCESS_KEY`).

The brief tells the agent to fix the product, not the test, and never to loosen a money or safety check to get green.

## Live targets

- Desk (mock mode, no keys, nothing signed): https://keel-desk.merjkerm.workers.dev
  (staging: https://keel-desk-staging.merjkerm.workers.dev)
- Keel Jobs (worker sign-up page): https://keel-jobs.merjkerm.workers.dev. Production is behind Cloudflare Turnstile,
  which a test browser should not be solving, so Kane tests the staging copy
  https://keel-jobs-staging.merjkerm.workers.dev (same code, its own D1 database, no captcha) and production is
  promoted only after that passes.

## What Kane caught (22 Nov 2026)

1. **Desk:** "pay Maria $0.10 for the logo" got the help message instead of a payment. Maria is on the allowlist, but
   the rule parser required a country in every payment. Fixed in `lib/parser.ts` + `lib/agent.ts`: the country
   comes from the allowlist; strangers are still refused (2 new unit tests).
2. **Jobs:** a wallet address pasted with a leading space was rejected. `maxlength="42"` cut the last character
   before `trim()`. Fixed in `jobs/page.html`: room for stray spaces, whitespace stripped.
3. **Jobs:** after an error, switching EN → PT translated the page but left the error in English. Fixed in
   `jobs/page.html`: the shown message is re-translated on every language switch.

Run log, including the runs that failed for reasons that were not app bugs (wrong tab names in my first tests,
the production captcha, replays opening the originally recorded URL): [PROGRESS.md](PROGRESS.md).

Gotcha worth knowing: a Kane replay opens the URL the test was *first recorded* on, even if you later edit `url:` in
the frontmatter. `kane-gate.mjs` therefore always passes `--override-start-url` for suites with a target.
