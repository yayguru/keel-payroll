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

## Kane evidence links

Production desk, final run (all passed):
- kill_switch: https://test-manager.lambdatest.com/projects/01M81W765THND0K7HYAX2KF5PN/test-cases/01M81WE4WHVASK1DFA2RWBMFYC/dashboard/share/US_DYP3F235NYSQIOPWY77VZWMF8QSA9TU2U3HMXFQA73EVYM4ZKFGH17YI0YHAW1PH?type=summary&agentView=true&fqdn=summary-page
- pay_allowlisted: https://test-manager.lambdatest.com/projects/01M81W765THND0K7HYAX2KF5PN/test-cases/01M81WKX3TW09K3Q9C8RY3VV70/dashboard/share/US_Q1V46WQK4UV8QRHT5JD7XHSSNRSUL2TRF3V6QXHLOYT21UMCN0BA0IS8ZS98O7RM?type=summary&agentView=true&fqdn=summary-page
- pay_known_payee_without_country: https://test-manager.lambdatest.com/projects/01M81W765THND0K7HYAX2KF5PN/test-cases/01M81XAWTGF44GYMCQCDXGR3V4/dashboard/share/US_K15ZNCUVHP5VJ8SBI1OPZ292Q2A33O0KZYDYSDNHVN4QK6DDQCS3P4NHTUK7F785?type=summary&agentView=true&fqdn=summary-page
- refuse_unknown_payee: https://test-manager.lambdatest.com/projects/01M81W765THND0K7HYAX2KF5PN/test-cases/01M81XGV321DYRTMWMV2AZCJDV/dashboard/share/US_LHMZUZWKQWTD13ZZ02HWCSVJRDSEUR7702ALA2LYHGWJTVK3JG2L6WMF7W71A88I?type=summary&agentView=true&fqdn=summary-page
- daily_cap: https://test-manager.lambdatest.com/projects/01M81W765THND0K7HYAX2KF5PN/test-cases/01M81W87Y2QS8E9PG5Q94W72CR/dashboard/share/US_RKEUHZP7R0YD0VAMB5A0DX8BQAFTC2DQ71JIQ9ILXPIJ27E8D0WV5Z18NOQJSFGU?type=summary&agentView=true&fqdn=summary-page

The failing run that caught bug 1 (pay_known_payee_without_country, before the fix): https://test-manager.lambdatest.com/projects/01M81W765THND0K7HYAX2KF5PN/test-cases/01M81XAWTGF44GYMCQCDXGR3V4/dashboard/share/US_Y7MKI6BEI287NMB6UB36FUJIYIUTJK8RZ75HM2RFVVTKSX5OMU1FFC8J7LBK5ANW?type=summary&agentView=true&fqdn=summary-page

Jobs suite (4/4 green on keel-jobs-staging) ran with `--local`, so it has no uploaded share links; logs are in PROGRESS.md.
