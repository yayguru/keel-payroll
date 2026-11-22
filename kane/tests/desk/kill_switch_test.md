---
url: https://keel-desk.merjkerm.workers.dev
tags: [desk, smoke, safety]
max_steps: 35
timeout: 240
---

# Revoking the session stops every later payment

## Open the desk
Open the page and wait until the instruction box is visible.

## Revoke
Click "Revoke session" (left column, under Payees) and confirm with "Revoke now" in the dialog.
Verify the desk shows the session as revoked.

## Payments are refused after revoke
Type "pay Maria (Brazil) $0.10 for the translation" into the "Instruction" box, click "Send" and wait for the reply.
Verify the reply refuses the payment because the session is revoked, and that no new receipt appears in "Receipts".
