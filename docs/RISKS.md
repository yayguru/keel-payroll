# Risks: attribution through Altana, and Textile on a smart wallet

Both questions were checked against the current docs and SDKs (`@celo/attribution-tags`, `@altananetwork/sdk` 1.1.0, Textile FX API v2) and against a Celo mainnet fork. No mainnet transaction was sent. No Altana or Textile account was created.

## (a) Does the attribution tag survive Altana's relay?

**Not in a way this repo can rely on for credit.** Put the tag on the transaction the indexer reads. That is the end of the transaction input, or, for an ERC-4337 bundle, the end of the UserOperation `callData`. Altana does not give us that hook.

What the docs say:

- Celo's attribution guide warns that some smart-account and relayer flows rewrite calldata and can strip trailing bytes, and tells you to check with `verifyTx` before trusting a tag. https://docs.celo.org/build/agents/attribution-tags
- `@celo/attribution-tags` decodes a tag at the end of `tx.input`. For ERC-4337 it also walks EntryPoint v0.6 and v0.7 `handleOps` and reads each UserOperation. Credit the UserOperation `sender`, not the bundler. The SDK README documents `verifyUserOps` and `fromEntryPointCalldata`.
- Textile's RFQ page says an inner swap tag is not enough for a hosted wallet. For ERC-4337 you append the suffix to the final UserOperation `callData` after the account's execute encoding and before gas estimation and signing. An indexer has to read UserOperations. The bundler's `handleOps` transaction is not what gets tagged. https://docs.textilecredit.com/api/v2/rfq.html
- Altana is not that shape. The wallet package is built on Porto / Ithaca and EIP-7702. `client.execute` posts the calls to `https://relay.altana.network`. `packages/wallet/src/execute.ts` in `altananetwork/altana-sdk` accepts `{ to, data, value }` and has no `dataSuffix` argument. The relay builds the outer transaction.

What the code proves:

- [test/attribution.test.ts](../test/attribution.test.ts) ABI-encodes `execute(target, taggedInnerData)`. `fromDataSuffix` on that outer hex is `null`. Appending the suffix after the ABI encoding makes `fromDataSuffix` return `celo_5bf71df0ebf6`.
- [test/risks.test.ts](../test/risks.test.ts) sends a `writeContract` through `agentWallet`, which is `withAttribution("celo_5bf71df0ebf6")`, and reads the code back off the transaction that would be signed.
- [scripts/fork-demo.ts](../scripts/fork-demo.ts) did the same on an Anvil fork of Celo. The mined transaction input decoded as schema 0, code `celo_5bf71df0ebf6`.

So a tag stuffed into `calls[0].data` still reaches the target contract, which ignores trailing bytes, but it does not sit at the end of the relay transaction. `verifyTx` on that relay hash should be treated as uncredited until someone shows a mainnet Altana receipt where `verifyTx` returns this code. Loops cannot add the tag later.

**What we ship instead.** Corridor transactions are sent by the agent key with `agentWallet`. The guard's `execute` is the inner call. The suffix is on the outer input. That is the path the fork demo checked.

## (b) Can an Altana wallet execute a Textile order?

**The swap call can. The keyless quote probably cannot, if the taker is the Altana account and the signer is the session key.**

Textile v2, from https://docs.textilecredit.com/api/ and https://docs.textilecredit.com/api/v2/authentication.html:

| Item | Value |
| --- | --- |
| Base URL | `https://api.textilecredit.com/v2` |
| Preview | `POST /rfq/preview`. No taker, no key, no signature. |
| Firm quote | `POST /rfq/request`. Blocks. Client timeout 75s. |
| Auth | None required. A wallet is the taker. |
| Keyless proof | EIP-712 `TakerControl` (`Textile Taker Control`, version `1`). `issuedAt` within 60 seconds. |
| Partner key | `Authorization: Bearer tx_live_…`. Skips `takerProof`. Create it in the Textile app after connecting a wallet. Optional. |
| Test key | `tx_test_…` only on chain 97 and chain 84532. Celo, including Sepolia, returns 400. There is no Celo Textile testnet. |
| Claim token | Returned once. Header `X-Rfq-Claim` for cancel, submit, and status. |
| Execution | Approve `takerPays` of the sell token to `quote.reactor`, then broadcast `transactions.swap` from the taker. The maker signed the order. The taker does not sign the swap. |
| Settlement contracts | Reactor `0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3`, Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`, fee controller `0x356f4FBe18893997D2F893AE8860eD6060b4521d`. |
| Minimum | Docs say a default $1 notional on mainnet, about $0.01 on the two testnets. |

Calls made while building this, with no key:

- `GET /v2/health` returned `{"status":"ok","venue":"engine"}`.
- Preview of 1 USD₮ to wBRL returned a price, about 5.92 wBRL per USD₮.
- Preview of 0.10 USD₮ to wBRL also returned a price (about 0.592 wBRL). The $1 floor did not apply to preview.
- Firm `POST /rfq/request` with no proof returned 401 `proof_of_control_required` and did not lock inventory.
- The same request signed by an empty wallet, for both 0.10 and 1 USD₮, returned 400 `insufficient_funds`. It did not return a size error. Once a wallet is funded, $0.10 might still be under a corridor floor that is checked later. Try it and keep the error. Do not assume $0.10 will fill.

Altana, from https://docs.altana.network/sdk/setup, https://docs.altana.network/concepts/off-chain-signatures, and the installed SDK:

- Package `@altananetwork/sdk`. No API key. Relay `https://relay.altana.network`. Celo chain id 42220. Keystore `0x83b30935f36d6ccf9B1ec3b5E47F2866b97cd27c`. Controller `0x47bA5fc2A5b0CcB24BA3fAC9D4B59400eE9fd1D6`.
- A session has `calls`, `spend`, and `expiry`, enforced on chain. `revokeSession` is one user operation and cannot be undone.
- The account cannot make a plain 65-byte ECDSA signature for the wallet address. `signOrder` wraps the digest in a nested EIP-712 envelope (`ERC1271Sign`) and returns `innerSig ‖ keyHash ‖ prehash`. [test/risks.test.ts](../test/risks.test.ts) asserts that signature is longer than 65 bytes.
- `isValidSignature` for a session key returns the ERC-1271 magic value only when `msg.sender` is an approved checker. The documented checkers are Permit2 and the token for EIP-3009. Textile's off-chain `eth_call` is not one of those, and the docs do not publish a checker address to approve.
- Because a 7702 account has code, Textile verifies the taker by `isValidSignature`, not by `ecrecover` alone. A session signature therefore fails closed unless Textile's caller is approved.

The on-chain swap itself does not need the taker's signature. If a partner API key names the Altana wallet as taker, `client.execute` can submit the approve and the swap, provided the session allowlist contains USD₮ and the reactor and the spend cap covers `takerPays`. That path is still the one that fails risk (a) for credit. This repo does not use it for the corridor.

**What we ship instead.** `PayrollGuard.isValidSignature` accepts a normal 65-byte signature from the agent over the digest Textile passes in. The forge test signs a hash with the agent key and expects `0x1626ba7e`, and expects a longer wrapped signature to return `0xffffffff`. The guard is the taker. The agent key signs `TakerControl`. Textile's documented EIP-1271 read matches that contract. Altana remains the session rail: cap, allowlist, expiry, revoke, and the desk halt.

## Fallback if a judge wants one wallet

Fund the Altana wallet, create a Textile partner key, and pass that key so `takerProof` is skipped. Grant the session with the reactor and the tokens on the allowlist. After `execute`, run `verifyTx` on the relay hash. If the code is missing, the corridor is not credited, and the guard path above is the one to ship. Do not append a second suffix onto data Textile already tagged. The Loops FAQ says to leave `includeAttribution` off and append only your own code. `tagSwapData` merges a schema-0 suffix instead of stacking one.
