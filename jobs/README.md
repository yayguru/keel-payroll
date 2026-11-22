# Keel Jobs

Public page where outside testers (BR, MX, AR, CO, NG, ID) do 1–3 tiny tasks and get paid by Keel in their
local stablecoin. No GitHub account needed. Live: https://keel-jobs.merjkerm.workers.dev (EN / PT-BR / ES).

- `worker.js`: Cloudflare Worker (D1 binding `DB`). Routes: `/`, `/admin`, `/api/quote`, `/api/submit`,
  `/api/paid`, `/api/admin/*`.
- `page.html`, `admin.html`: inlined by `node build.mjs` into `dist/worker.js`.
- `schema.sql`: D1 tables.

Anti-spam: Cloudflare Turnstile, 5 submissions per IP per hour, one submission per wallet, honeypot field.

Admin: `/admin` asks for the admin token. The Worker stores only its SHA-256 (`ADMIN_TOKEN_SHA256`); the token
lives on the owner's machine. Requests carrying the token skip the captcha (used for end-to-end tests).

No keys on Cloudflare. Payouts run on the owner's machine:

```
# dry run: lists approved submissions and the payout route
JOBS_ADMIN_TOKEN=... npx tsx scripts/jobs-payout.ts
# pay only ids the owner approved
ONLY_IDS=3,5 SEND=1 I_UNDERSTAND_MAINNET=1 npx tsx scripts/jobs-payout.ts
```

The script allowlists the payee on PayrollGuard (owner key), then the agent sends the local stablecoin through
`guard.execute` from the guard's balance. If the guard lacks that token, `TOPUP=1` runs a $1 Textile swap
from the guard's USD₮ first. Every transaction carries the ERC-8021 tag; the submission is then marked paid
with its Celoscan link.

Redeploy: `node build.mjs`, `PUT /api/admin/stage` with `dist/worker.js` (admin token), then upload the staged
build through the Cloudflare Workers API with the bindings in `wrangler.toml` (keep the Turnstile secret).
Or `npx wrangler deploy` from this folder.
