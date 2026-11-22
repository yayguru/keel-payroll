---
url: https://keel-desk.merjkerm.workers.dev
tags: [desk, money, safety]
max_steps: 40
timeout: 240
---

# The daily cap stops an over-limit payment

## Open the desk
Open the page and wait until the instruction box is visible.

## Lower the daily cap
Open the "Controls" tab if needed. Set the "Daily cap, USD" field to 0.25 and click "Set daily". Wait for Keel's reply.
Verify the "Today" meter now shows a cap of $0.25.

## First payment fits
Go to the "Chat" tab if needed. Send "pay Maria (Brazil) $0.10 for the translation" and wait for the reply.
Verify it is a simulated payment to Maria.

## Second payment is refused
Send "pay Juan (Argentina) $0.20 for testing" and wait for the reply.
Verify the reply refuses it because of the $0.25 daily cap with $0.10 already used, and says nothing was sent.
