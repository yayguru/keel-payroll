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

## Tagged transactions (Celo mainnet, 21–22 Nov 2026)

Attribution code: `celo_5bf71df0ebf6`. Every transaction below was sent from the owner or agent key through `@celo/attribution-tags` `withAttribution`, and the runner (`scripts/mainnet-checklist.ts`) read each one back and checked the ERC-8021 suffix on `tx.input` before moving on. Full list with gas: `submission/mainnet-txs.json`.

- Owner (business treasury): [0x093c0AfA09fF4715595a79770447C60C4eCFfd1C](https://celoscan.io/address/0x093c0AfA09fF4715595a79770447C60C4eCFfd1C)
- Agent: [0x1B3577f1877C31CF1eD6A8d89BA0f7Eb4Aa6F389](https://celoscan.io/address/0x1B3577f1877C31CF1eD6A8d89BA0f7Eb4Aa6F389)
- PayrollGuard (Textile taker, source verified on Sourcify, exact match): [0xA8c05a073A02832BC9B3da469d52beBFdc422e64](https://celoscan.io/address/0xA8c05a073A02832BC9B3da469d52beBFdc422e64). Daily cap 2 USD₮, expiry 20 Dec 2026. Allowed targets: USD₮, Textile reactor, wBRL, wARS, cNGN, IDRX, wMXN, wCOP.
- ERC-8004 agent id: **10091** on `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` ([register](https://celoscan.io/tx/0x21cccb9c8584b3b3f56756c0abe087466305c5e77116dc35f53d6a706c3cca47), [setAgentURI](https://celoscan.io/tx/0xce7904ca4c3307c5b9afc153d292986800a7c9b8d2b692b5eb01f7d8cb5603b1)).
- Textile FX corridor, USD₮ → wBRL, rfq `rfq_0pWeaThqdEpxjlB5`: 1.00 USD₮ in, 5.3112 wBRL out, all three calls sent by the agent through `PayrollGuard.execute` — [approve](https://celoscan.io/tx/0x88fcabcf369a5b5d647774cf280f966d74e60111a6c3384bf621dd433618e5ee), [swap](https://celoscan.io/tx/0xc29ffef3b5fb988ae0d7df3439c52e20069b55dbd6de93ad6f71635db005f172), [payout 0.53 wBRL](https://celoscan.io/tx/0xce0df32bae1d1515cc221a89600b1da445feed1a6a8d504293396283f6be20ab). The firm quote used the keyless `takerProof`; Textile accepted the guard's ERC-1271 check.
- This first payout went to the owner's own wallet as an end-to-end test. It is not the named-user payout. The remaining 4.78 wBRL stays in the guard for the first real contractor payout.
- Altana session on Celo mainnet, Altana wallet = the owner address (EIP-7702), session key = the agent key. Permissions: USD₮ spend cap 1.00 per day; calls only to USD₮, the Textile reactor and the six local stables; 7-day expiry; key registered in the Altana KeyStore (keyId `0x478eed8e3d62cb74b9062907a3161c1c0d85ac493134657b6d73fbe0232e4ace`). [grantSession](https://celoscan.io/tx/0x1d38e40fe15bd7913a883ae3f541dfb14cb0c3ac1c25b13536ebda9dd74c233c) (fee + KeyStore registration 19.67 CELO), then [revokeSession](https://celoscan.io/tx/0x2eb5628042c99bb0c030232307aa4f2c799f5fa2e27301c4ee6511f7bb847fe9) (0.085 CELO), one owner signature each. Script: `scripts/altana-session-run.ts`.
- Both Altana transactions are built and sent by the Altana relay, so they carry no ERC-8021 tag: the SDK has no suffix hook (see `docs/RISKS.md`). Every transaction we sign ourselves, including all Textile calls through the guard, is tagged.
- SDK note: on Celo mainnet the SDK also provisions the wallet on Ethereum. For an owner EOA that already has Celo history, the grant then fails with `Invalid auth item nonce, expected N, got 0`. Provisioning Celo alone (`provisionAlso: []`) fixed it.

| Step | From | Tagged | Tx |
| --- | --- | --- | --- |
| swap.approve CELO | `0x093c…fd1c` | yes | [0xe9c8460f…](https://celoscan.io/tx/0xe9c8460f8310fed55adc416818faa0c821c762a64003dc90d9accaa2f29e2545) |
| swap CELO->USD₮ (Uniswap v3 0.01%) | `0x093c…fd1c` | yes | [0x24372fbb…](https://celoscan.io/tx/0x24372fbbd6f86f6d7f1fea398afae5e08db0ad1e7cc5a61e3535ad1afbec88e7) |
| guard.deploy | `0x093c…fd1c` | yes | [0x9c2480f2…](https://celoscan.io/tx/0x9c2480f2ad7054e71b606456be8af2c393c6634595134a3ef9a2c2dde7fdf791) |
| guard.setTarget 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e | `0x093c…fd1c` | yes | [0x364e0331…](https://celoscan.io/tx/0x364e0331b301174e440cb328872a10469342077af543a1582aa3d3407f82bfcf) |
| guard.setTarget 0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3 | `0x093c…fd1c` | yes | [0x9fae106b…](https://celoscan.io/tx/0x9fae106b6914129e2887cd1666cbe470747946815b95443de600f198bb4243af) |
| guard.setTarget 0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0 | `0x093c…fd1c` | yes | [0xb887ad2a…](https://celoscan.io/tx/0xb887ad2a6ed097d64f4ff661b91744318fb3f0b42d2411e4c9a706acce12c0b2) |
| guard.setTarget 0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D | `0x093c…fd1c` | yes | [0xf147972e…](https://celoscan.io/tx/0xf147972e894a2b456c2bd3775f376154c55c4f99f71729c1fa16263e3a0f40c6) |
| guard.setTarget 0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f | `0x093c…fd1c` | yes | [0xa89076e2…](https://celoscan.io/tx/0xa89076e28cd06bb910ae9a24179a655499b675ffe12f0a44945b51ca055f2ad1) |
| guard.setTarget 0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22 | `0x093c…fd1c` | yes | [0x020b7473…](https://celoscan.io/tx/0x020b747383be56b95f28ab07e88438d77b88842cafe4ddfb149bd4b43738d3a7) |
| guard.setTarget 0x337E7456B420bD3481e7FA61fA9850343d610d34 | `0x093c…fd1c` | yes | [0x0aeeba85…](https://celoscan.io/tx/0x0aeeba854f5673435dd42d0e9884bafc16f5a2ab545de4a79bff8e9ba956f913) |
| guard.setTarget 0x8a1D45e102e886510e891d2Ec656a708991e2D76 | `0x093c…fd1c` | yes | [0x64aedd6f…](https://celoscan.io/tx/0x64aedd6f1763bff83165f9d862f4943a1628b8e134523340079cf0d1a0ba6e4d) |
| guard.setPayee 0x093c0AfA09fF4715595a79770447C60C4eCFfd1C (owner-controlled test payee) | `0x093c…fd1c` | yes | [0x41efa3c3…](https://celoscan.io/tx/0x41efa3c311f5a581a976d64f3439117a84686689b2286cf11e8f3d974c9f6bbd) |
| 8004.register agentId=10091 | `0x1b35…f389` | yes | [0x21cccb9c…](https://celoscan.io/tx/0x21cccb9c8584b3b3f56756c0abe087466305c5e77116dc35f53d6a706c3cca47) |
| 8004.setAgentURI agentId=10091 | `0x1b35…f389` | yes | [0xce7904ca…](https://celoscan.io/tx/0xce7904ca4c3307c5b9afc153d292986800a7c9b8d2b692b5eb01f7d8cb5603b1) |
| owner -> guard 1 USD₮ | `0x093c…fd1c` | yes | [0xd89b056f…](https://celoscan.io/tx/0xd89b056f7b9b32d57cf592f9df74b9ce556c5da13e7b72110491e46238c21f09) |
| textile.approve USD₮->reactor (via guard) | `0x1b35…f389` | yes | [0x88fcabcf…](https://celoscan.io/tx/0x88fcabcf369a5b5d647774cf280f966d74e60111a6c3384bf621dd433618e5ee) |
| textile.swap 1 USD₮->5.3112 wBRL (via guard) | `0x1b35…f389` | yes | [0xc29ffef3…](https://celoscan.io/tx/0xc29ffef3b5fb988ae0d7df3439c52e20069b55dbd6de93ad6f71635db005f172) |
| payout 0.53 wBRL guard->owner test wallet | `0x1b35…f389` | yes | [0xce0df32b…](https://celoscan.io/tx/0xce0df32bae1d1515cc221a89600b1da445feed1a6a8d504293396283f6be20ab) |
| altana.grantSession (relay tx; cap 1 USD₮/day, 8-contract allowlist, 7-day expiry, session key = agent) | `0xde31…c5b4` | no (relay) | [0x1d38e40f…](https://celoscan.io/tx/0x1d38e40fe15bd7913a883ae3f541dfb14cb0c3ac1c25b13536ebda9dd74c233c) |
| altana.revokeSession (relay tx) | `0x5318…2faa` | no (relay) | [0x2eb56280…](https://celoscan.io/tx/0x2eb5628042c99bb0c030232307aa4f2c799f5fa2e27301c4ee6511f7bb847fe9) |

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
