---
url: https://keel-desk.merjkerm.workers.dev
tags: [desk, money]
max_steps: 25
timeout: 180
---

# Owner leaves out the country of a known payee

## Open the desk
Open the page and wait until the instruction box is visible.

## Pay Maria without a country
Type "pay Maria $0.10 for the logo" into the instruction box and send it. Wait for Keel's reply.

## Keel pays the allowlisted Maria
Verify the reply is a payment to Maria of $0.10 in wBRL (Maria is already on the allowlist as Brazil), not a
help message listing what Keel can do.
