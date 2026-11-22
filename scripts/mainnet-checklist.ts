/**
 * Celo mainnet checklist runner for Keel Payroll. Refuses unless SEND=1 and
 * I_UNDERSTAND_MAINNET=1. Keys come from the environment only and are never
 * printed. Every broadcast goes through `agentWallet` (withAttribution), and
 * each receipt is checked for the ERC-8021 code before the next step.
 *
 *   tsx scripts/mainnet-checklist.ts <swap|deploy|allow|fund|status>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createPublicClient, http, parseAbi, erc20Abi, encodeFunctionData, encodeDeployData,
  formatUnits, type Abi, type Hex, type Address,
} from "viem";
import { celo } from "viem/chains";
import { fromDataSuffix } from "@celo/attribution-tags";
import { accountFromEnv } from "../lib/taker-proof";
import { agentWallet } from "../lib/wallet";
import { DEFAULT_ATTRIBUTION_CODE, explorerTx } from "../lib/constants";
import { corridorTargets, USDT } from "../lib/corridors";
import { guardAbi } from "../lib/guard";
import { DEMO_SESSION_EXPIRY } from "../lib/demo-state";
import { registrationDataUri } from "../lib/registration";
import { IDENTITY_REGISTRY } from "../lib/corridors";

const RPC = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
const STATE = process.env.STATE_FILE ?? ".mainnet/state.json";
const ARTIFACT = process.env.GUARD_ARTIFACT ?? "out/PayrollGuard.sol/PayrollGuard.json";
const CELO_TOKEN = "0x471EcE3750Da237f93B8E339c536989b8978a438" as const;
const SWAP_ROUTER02 = "0x5615CDAb10dc425a742d643d949a7F474C01abc4" as const;
const QUOTER_V2 = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8" as const;

const pub = createPublicClient({ chain: celo, transport: http(RPC) });
type State = Record<string, any>;
const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { txs: [] };
const save = () => (mkdirSync(dirname(STATE), { recursive: true }), writeFileSync(STATE, JSON.stringify(state, null, 2)));

async function confirm(label: string, hash: Hex, requireTag = true) {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const tx = await pub.getTransaction({ hash });
  const tag = fromDataSuffix(tx.input);
  const tagged = !!tag?.codes.includes(DEFAULT_ATTRIBUTION_CODE);
  state.txs.push({ label, hash, from: tx.from, to: tx.to ?? undefined, status: receipt.status, tagged, gasUsed: receipt.gasUsed.toString(), contract: receipt.contractAddress ?? undefined });
  save();
  console.log(`${label}: ${receipt.status} tagged=${tagged} ${explorerTx(hash)}`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  if (!tagged && requireTag) throw new Error(`${label} is missing the attribution tag`);
  // forno is load balanced; let every backend see the new nonce before the next send.
  await new Promise((r) => setTimeout(r, 5000));
  return receipt;
}

function owner() { const a = accountFromEnv("OWNER_PRIVATE_KEY"); if (!a) throw new Error("OWNER_PRIVATE_KEY missing"); return a; }
function agent() { const a = accountFromEnv("AGENT_PRIVATE_KEY"); if (!a) throw new Error("AGENT_PRIVATE_KEY missing"); return a; }

const quoterAbi = parseAbi(["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)"]);
const routerAbi = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)"]);

async function swap() {
  const o = owner();
  const amountIn = BigInt(process.env.SWAP_CELO_WEI ?? (25n * 10n ** 18n).toString());
  const fee = 100;
  const q = await pub.simulateContract({ address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn: CELO_TOKEN, tokenOut: USDT.address, amountIn, fee, sqrtPriceLimitX96: 0n }] });
  const out = q.result[0];
  const min = (out * 98n) / 100n;
  const spot = await pub.simulateContract({ address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn: CELO_TOKEN, tokenOut: USDT.address, amountIn: 10n ** 17n, fee, sqrtPriceLimitX96: 0n }] });
  const impact = 1 - Number(out) / (Number(spot.result[0]) * Number(amountIn / 10n ** 17n));
  console.log(`quote ${formatUnits(amountIn, 18)} CELO -> ${formatUnits(out, 6)} USD₮ (min ${formatUnits(min, 6)}), impact vs 0.1 CELO ${(impact * 100).toFixed(2)}%`);
  if (impact > 0.05) throw new Error("price impact above 5%");
  if (process.env.DRY === "1") return;
  const w = agentWallet(o, http(RPC));
  const allowance = await pub.readContract({ address: CELO_TOKEN, abi: erc20Abi, functionName: "allowance", args: [o.address, SWAP_ROUTER02] });
  if (allowance < amountIn) await confirm("swap.approve CELO", await w.writeContract({ address: CELO_TOKEN, abi: erc20Abi, functionName: "approve", args: [SWAP_ROUTER02, amountIn] }));
  await pub.simulateContract({ account: o.address, address: SWAP_ROUTER02, abi: routerAbi, functionName: "exactInputSingle", args: [{ tokenIn: CELO_TOKEN, tokenOut: USDT.address, fee, recipient: o.address, amountIn, amountOutMinimum: min, sqrtPriceLimitX96: 0n }] });
  await confirm("swap CELO->USD₮ (Uniswap v3 0.01%)", await w.writeContract({ address: SWAP_ROUTER02, abi: routerAbi, functionName: "exactInputSingle", args: [{ tokenIn: CELO_TOKEN, tokenOut: USDT.address, fee, recipient: o.address, amountIn, amountOutMinimum: min, sqrtPriceLimitX96: 0n }] }));
}

async function deploy() {
  if (state.guard) { console.log(`guard already ${state.guard}`); return; }
  const o = owner(); const a = agent();
  const art = JSON.parse(readFileSync(ARTIFACT, "utf8")) as { abi: Abi; bytecode: Hex | { object: Hex } };
  const bytecode = typeof art.bytecode === "string" ? art.bytecode : art.bytecode.object;
  const dailyCap = BigInt(process.env.GUARD_DAILY_CAP ?? "2000000");
  const data = encodeDeployData({ abi: art.abi, bytecode, args: [o.address, a.address, USDT.address, dailyCap, BigInt(DEMO_SESSION_EXPIRY)] });
  const w = agentWallet(o, http(RPC));
  const r = await confirm("guard.deploy", await w.sendTransaction({ data }));
  state.guard = r.contractAddress; save();
  console.log(`guard ${state.guard}`);
}

async function allow() {
  const o = owner(); const w = agentWallet(o, http(RPC)); const g = state.guard as Address;
  for (const t of corridorTargets()) {
    if (await pub.readContract({ address: g, abi: guardAbi, functionName: "allowedTarget", args: [t] })) continue;
    await confirm(`guard.setTarget ${t}`, await w.writeContract({ address: g, abi: guardAbi, functionName: "setTarget", args: [t, true] }));
  }
  const payees = (process.env.TEST_PAYEES ?? o.address).split(",").map((s) => s.trim() as Address);
  for (const p of payees) {
    if (await pub.readContract({ address: g, abi: guardAbi, functionName: "allowedPayee", args: [p] })) continue;
    await confirm(`guard.setPayee ${p} (owner-controlled test payee)`, await w.writeContract({ address: g, abi: guardAbi, functionName: "setPayee", args: [p, true] }));
  }
}

async function fund() {
  const o = owner(); const w = agentWallet(o, http(RPC));
  const amount = BigInt(process.env.FUND_USDT ?? "1050000");
  await confirm(`owner -> guard ${formatUnits(amount, 6)} USD₮`, await w.writeContract({ address: USDT.address, abi: erc20Abi, functionName: "transfer", args: [state.guard, amount] }));
}

async function record() {
  const [label, hash] = [process.argv[3], process.argv[4] as Hex];
  // Relay transactions (Altana) are built by the relay; record them without requiring our tag.
  await confirm(label, hash, process.env.REQUIRE_TAG !== "0");
}

async function setUri() {
  const a = agent(); const w = agentWallet(a, http(RPC));
  const id = BigInt(process.env.AGENT_ID!);
  const uri = registrationDataUri(process.env.AGENT_PUBLIC_URL ?? "https://github.com/yayguru/keel-payroll", Number(id));
  const abi = parseAbi(["function setAgentURI(uint256 agentId, string newURI)"]);
  await confirm(`8004.setAgentURI agentId=${id}`, await w.writeContract({ address: IDENTITY_REGISTRY, abi, functionName: "setAgentURI", args: [id, uri] }));
  state.agentId = id.toString(); save();
}

async function main() {
  const cmd = process.argv[2];
  if (cmd !== "status" && cmd !== "record" && (process.env.SEND !== "1" || process.env.I_UNDERSTAND_MAINNET !== "1")) throw new Error("Set SEND=1 and I_UNDERSTAND_MAINNET=1.");
  if (cmd === "swap") return swap();
  if (cmd === "deploy") return deploy();
  if (cmd === "allow") return allow();
  if (cmd === "fund") return fund();
  if (cmd === "record") return record();
  if (cmd === "seturi") return setUri();
  if (cmd === "status") { console.log(JSON.stringify(state, null, 2)); return; }
  throw new Error("usage: swap|deploy|allow|fund|status");
}
main().catch((e) => { console.error(e instanceof Error ? e.message.split("\n").slice(0, 4).join("\n") : e); process.exit(1); });
