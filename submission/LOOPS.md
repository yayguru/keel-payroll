# Loops House — copy for Agents Open for Business

Paste the sections you need. Replace the bracketed lines after the mainnet run. Do not claim a mainnet transaction this repository has not sent.

## Name

Keel Payroll

## Tracks

Stablecoin Corridors (Textile FX). Altana Agent Wallets.

## One line

A payroll agent that turns a sentence into a tagged USD₮ to local-stablecoin payout, inside a cap the owner can revoke.

## Description

A small business owner tells Keel who to pay: "pay Maria (Brazil) $0.10 for the translation, Juan (Argentina) $0.20 for testing", or sets a Friday rule. Keel checks the payee allowlist, the day's cap, and the session cap, asks Textile FX for the wBRL or wARS (also cNGN, IDRX, wMXN, wCOP) price, and pays from a treasury the owner still controls.

The corridor runs through PayrollGuard. The guard is the Textile taker. The agent key can only call allowlisted contracts, only until expiry, and only up to a daily USD₮ cap. The owner revokes that key in one transaction and the next payout reverts. A separate Altana session carries the same three limits — spend cap, contract allowlist, expiry — and is revoked with `revokeSession`. Textile's keyless taker proof does not accept Altana's nested session signature, so the FX swap is sent from the guard, where the ERC-8021 tag is on the transaction input. The write-up is `docs/RISKS.md`.

Every broadcast uses `@celo/attribution-tags` `withAttribution("celo_5bf71df0ebf6")`. The public desk is a mock: live Textile previews, no keys, no mainnet signing.

## Named user

[Name of the business owner, and how you reached them.]

[Contractor name, country, and wallet. This wallet is not on the team. The payout is the job: translation, testing, or whatever they actually did.]

The mock desk ships placeholder addresses for Maria and Juan so the flow can be clicked. Those addresses are not the submission's users.

## Tagged transactions

Attribution code: `celo_5bf71df0ebf6`

- ERC-8004 register: [celoscan tx]
- Textile approve, swap, and local transfer: [celoscan txs]
- Altana grant and, if you show the halt, revoke: [celoscan txs]
- Agent id: [from the Registered event]
- Guard: [address]
- Altana wallet: [address]

## Requirement checklist

- Tagged Textile conversion on Celo mainnet in a listed corridor, inside the product flow. Script: `npm run settle`. Code: `lib/settle.ts`.
- Local stablecoin arrives at a wallet outside the team. The guard's `transfer` payee has to be allowlisted.
- ERC-8004 identity registered from the agent wallet. Script: `npm run register:8004`. Card: `/.well-known/agent-card.json`.
- Altana wallet, one session with cap, allowlist, and expiry, plus a revoke. Scripts: `npm run session:grant:send`, `npm run session:revoke`.
- Not arbitrage, not self-trading, not a Textile maker.
- Code written for this hackathon, from 20 Nov 2026. No copied Keel files.

## Questions for the organizers

1. For a payroll product, is the named user the business owner, and is the contractor who receives the local stablecoin the "recipient outside the team"? The independent-user note says a wallet funded by the team does not count. A payout funds the contractor by design. We want to be sure paying them is the requirement, not a disqualification.
2. Will a tag inside an Altana relay transaction be credited if `verifyTx` only sees it by decoding EntryPoint user operations? Altana's relay is Porto / EIP-7702, and the SDK has no suffix hook. We tagged the guard's outer transaction instead and would like that to count for both tracks.
3. Textile's docs say the default firm-quote floor is $1. A signed request for $0.10 from an empty wallet returned `insufficient_funds`, not a size error, and preview prices $0.10. Does a filled $0.10 conversion count, or should we size the demo at $1?
4. Self Agent ID is recommended and not listed as a requirement on these two tracks. We did not integrate it. Please say if that blocks either track.
