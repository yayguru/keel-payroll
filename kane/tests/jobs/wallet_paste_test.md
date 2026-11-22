---
url: https://keel-jobs.merjkerm.workers.dev
tags: [jobs, smoke, forms]
max_steps: 35
timeout: 180
---

# Wallet field: reject junk, accept a pasted address with a stray space

## Open Keel Jobs in English
Open the page and click the EN button.

## Fill the basics
Type "kane-check" as the name, choose "Brazil · wBRL" as the country, and type "great idea" in the first
question of task A.

## Malformed address is rejected
Type "0x1234" into "Your Celo wallet address" and click Send.
Verify the message "That doesn't look like a Celo address (0x + 40 characters)." is shown.

## Address pasted with a leading space is accepted by the field
Clear the wallet field and type " 0x1111111111111111111111111111111111111111" (with one space before 0x).
Verify the wallet field now contains the full address ending in "1111" with all 40 characters after 0x.
Click Send and verify the wallet error message is not shown (a captcha message is fine).
