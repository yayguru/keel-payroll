/**
 * Pays APPROVED Keel Jobs submissions from PayrollGuard. Runs on the owner's
 * machine; the Cloudflare Worker never sees a key.
 *
 * For each approved submission named in ONLY_IDS (one id per owner approval):
 *   1. owner key: PayrollGuard.setPayee(wallet, true)          (tagged)
 *   2. agent key: PayrollGuard.execute(localToken.transfer)    (tagged)
 *      If the guard holds too little of that local stablecoin and TOPUP=1,
 *      the agent instead runs a $1 Textile USD₮→local swap through the guard
 *      (Textile's firm-quote floor is $1) and pays the submission's share of it.
 *   3. marks the submission paid on the Worker with the tx hash.
 *
 * Dry run by default. Broadcasts only with SEND=1 I_UNDERSTAND_MAINNET=1.
 * Env: JOBS_ADMIN_TOKEN, OWNER_PRIVATE_KEY, AGENT_PRIVATE_KEY, ONLY_IDS=3,5
 *      optional JOBS_URL, CELO_RPC_URL, TOPUP=1, MAX_USD (default 0.30).
 */
import { createPublicClient, encodeFunctionData, erc20Abi, http, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { fromDataSuffix } from "@celo/attribution-tags";
import { accountFromEnv } from "../lib/taker-proof";
import { agentWallet } from "../lib/wallet";
import { DEFAULT_ATTRIBUTION_CODE, explorerTx } from "../lib/constants";
import { corridorForCountry, USDT, type Corridor } from "../lib/corridors";
import { guardAbi } from "../lib/guard";
import { previewAmount } from "../lib/textile";
import { formatUnits, usdToUnits } from "../lib/money";
import { settlePayout } from "../lib/settle";

const JOBS_URL = (process.env.JOBS_URL ?? "https://keel-jobs.merjkerm.workers.dev").replace(/\/$/, "");
const RPC = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
const GUARD = (process.env.PAYROLL_GUARD_ADDRESS ?? "0xA8c05a073A02832BC9B3da469d52beBFdc422e64") as Address;
const MAX_USD = Number(process.env.MAX_USD ?? "0.30");
const SEND = process.env.SEND === "1" && process.env.I_UNDERSTAND_MAINNET === "1";

type Submission = { id: number; handle: string; country: string; wallet: Address; status: string; amount_usd: string | null };

const pub = createPublicClient({ chain: celo, transport: http(RPC) });
const pause = () => new Promise((r) => setTimeout(r, 4000)); // load-balanced public RPC

async function jobs(path: string, init: RequestInit = {}) {
  const token = process.env.JOBS_ADMIN_TOKEN;
  if (!token) throw new Error("JOBS_ADMIN_TOKEN is required.");
  const r = await fetch(`${JOBS_URL}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
  const body = (await r.json()) as any;
  if (!body.ok) throw new Error(`jobs api ${path}: ${body.error ?? r.status}`);
  return body;
}

async function tagged(hash: Hex) {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const tx = await pub.getTransaction({ hash });
  if (receipt.status !== "success") throw new Error(`reverted ${explorerTx(hash)}`);
  if (!fromDataSuffix(tx.input)?.codes.includes(DEFAULT_ATTRIBUTION_CODE)) throw new Error(`missing attribution tag on ${hash}`);
  await pause();
  return hash;
}

async function payOne(s: Submission) {
  const corridor = corridorForCountry(s.country) as Corridor | undefined;
  if (!corridor) throw new Error(`#${s.id}: no corridor for ${s.country}`);
  const usd = s.amount_usd ?? "0.10";
  if (!(Number(usd) > 0 && Number(usd) <= MAX_USD)) throw new Error(`#${s.id}: amount $${usd} is above MAX_USD ${MAX_USD}`);
  const preview = await previewAmount(corridor, usdToUnits(usd));
  if (!preview.ok) throw new Error(`#${s.id}: Textile preview failed: ${preview.reason}`);
  const local = BigInt(preview.buyAmount);
  const held = await pub.readContract({ address: corridor.address, abi: erc20Abi, functionName: "balanceOf", args: [GUARD] });
  const usdtHeld = await pub.readContract({ address: USDT.address, abi: erc20Abi, functionName: "balanceOf", args: [GUARD] });
  const allowed = await pub.readContract({ address: GUARD, abi: guardAbi, functionName: "allowedPayee", args: [s.wallet] });
  const route = held >= local ? "guard balance" : process.env.TOPUP === "1" ? "Textile $1 swap + share" : "BLOCKED";
  console.log(`#${s.id} ${s.handle} ${s.country} ${s.wallet} $${usd} = ${formatUnits(local, corridor.decimals, 4)} ${corridor.symbol}; guard holds ${formatUnits(held, corridor.decimals, 4)} ${corridor.symbol}, ${formatUnits(usdtHeld, 6, 2)} USD₮; payee allowlisted=${allowed}; route=${route}`);
  if (route === "BLOCKED") {
    console.log(`  not enough ${corridor.symbol} in the guard. Fund the guard with ≥1 USD₮ and rerun with TOPUP=1 (Textile minimum is $1).`);
    return;
  }
  if (route !== "guard balance" && usdtHeld < 1_000_000n) {
    console.log("  TOPUP needs ≥1 USD₮ in the guard. Run: tsx scripts/mainnet-checklist.ts fund (FUND_USDT=1000000).");
    return;
  }
  if (!SEND) { console.log("  dry run, nothing sent."); return; }

  const owner = accountFromEnv("OWNER_PRIVATE_KEY");
  const agent = accountFromEnv("AGENT_PRIVATE_KEY");
  if (!owner || !agent) throw new Error("OWNER_PRIVATE_KEY and AGENT_PRIVATE_KEY are required to send.");
  if (!allowed) {
    const h = await agentWallet(owner, http(RPC)).writeContract({ address: GUARD, abi: guardAbi, functionName: "setPayee", args: [s.wallet, true] });
    console.log(`  setPayee ${explorerTx(await tagged(h))}`);
  }
  let payHash: Hex;
  if (route === "guard balance") {
    payHash = await agentWallet(agent, http(RPC)).writeContract({
      address: GUARD, abi: guardAbi, functionName: "execute",
      args: [corridor.address, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [s.wallet, local] })],
    });
    await tagged(payHash);
  } else {
    const r = await settlePayout(
      { rpcUrl: RPC, agentKey: process.env.AGENT_PRIVATE_KEY as Hex, guard: GUARD, payee: s.wallet, corridor, sellAmount: 1_000_000n, payoutAmount: local },
      true,
    );
    if (r.simulated) throw new Error("settle did not broadcast");
    for (const step of r.hashes) console.log(`  ${step.label} ${step.explorer}`);
    payHash = r.hashes[r.hashes.length - 1].hash;
  }
  console.log(`  payout ${explorerTx(payHash)}`);
  await jobs(`/api/admin/submissions/${s.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "paid", tx_hash: payHash, amount_local: formatUnits(local, corridor.decimals, 4) }),
  });
  console.log(`  marked paid on Keel Jobs`);
}

async function main() {
  const only = (process.env.ONLY_IDS ?? "").split(",").map((x) => Number(x.trim())).filter((n) => n > 0);
  const { submissions } = (await jobs("/api/admin/submissions?status=approved")) as { submissions: Submission[] };
  console.log(`${submissions.length} approved: ${submissions.map((s) => `#${s.id} ${s.handle} ${s.country}`).join(", ") || "none"}`);
  if (only.length === 0) {
    console.log("Set ONLY_IDS to the ids the owner approved in chat. Nothing else is paid.");
    return;
  }
  for (const s of submissions.filter((x) => only.includes(x.id))) await payOne(s);
}

main().catch((e) => { console.error(e instanceof Error ? e.message.split("\n").slice(0, 3).join("\n") : e); process.exit(1); });
