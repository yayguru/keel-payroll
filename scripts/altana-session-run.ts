/**
 * Altana session on Celo for Keel Payroll: quote, grant, revoke.
 * The owner EOA is the Altana wallet (EIP-7702); the agent key is the session
 * key. Fees are forced to native CELO. Keys come from the environment and are
 * never printed. Refuses to broadcast without SEND=1 and I_UNDERSTAND_MAINNET=1.
 *
 *   tsx scripts/altana-session-run.ts <quote|grant|revoke>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, CELO, signerFromPrivateKey, serializeSession, deserializeSession } from "@altananetwork/sdk";
import { altanaSessionPlan } from "../lib/altana-plan";

const NATIVE = "0x0000000000000000000000000000000000000000" as const;
const SESSION_FILE = process.env.SESSION_FILE ?? ".mainnet/altana-session.json";
const j = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

async function main() {
  const cmd = process.argv[2];
  // CELO names Ethereum in provisionAlso. For an EOA that already has Celo
  // history, the Ethereum record (EOA nonce 0) is the last one the relay sees and
  // the Celo grant fails with "Invalid auth item nonce, expected N, got 0".
  // Provisioning Celo alone signs the 7702 authorization at the Celo nonce.
  const client = createClient({ chains: [{ ...CELO, provisionAlso: [] } as typeof CELO] });
  const admin = signerFromPrivateKey(process.env.OWNER_PRIVATE_KEY as `0x${string}`);
  const sessionSigner = signerFromPrivateKey(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
  const wallet = await client.createWallet({ signer: admin });
  const cap = process.env.SESSION_CAP_USD ?? "1.00";
  const expiry = Number(process.env.SESSION_EXPIRY ?? Math.floor(Date.now() / 1000) + 7 * 86_400);
  const plan = altanaSessionPlan(cap, expiry);
  const register = process.env.ALTANA_REGISTER !== "0";
  const base = { wallet, signer: admin, sessionSigner, permissions: plan.permissions, expiry, chainId: 42220, feeToken: NATIVE, register } as const;
  console.log(`wallet ${wallet.address} cap ${cap} USD₮/day expiry ${new Date(expiry * 1000).toISOString()} calls ${plan.permissions.calls.length} register ${register}`);
  if (cmd === "quote") {
    console.log(j(await client.quoteGrantSession(base as any)));
    return;
  }
  if (process.env.SEND !== "1" || process.env.I_UNDERSTAND_MAINNET !== "1") throw new Error("Set SEND=1 and I_UNDERSTAND_MAINNET=1.");
  if (cmd === "grant") {
    const s = await client.grantSession(base as any);
    mkdirSync(dirname(SESSION_FILE), { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(serializeSession(s)), { mode: 0o600 });
    console.log(j({ status: s.status, transactionHash: s.transactionHash, keyId: s.keyId, keyHash: s.keyHash, legs: s.legs }));
    return;
  }
  if (cmd === "revoke") {
    const session = deserializeSession(JSON.parse(readFileSync(SESSION_FILE, "utf8")), sessionSigner);
    const q = await client.quoteRevokeSession({ wallet, signer: admin, session, feeToken: NATIVE } as any);
    console.log("revoke quote", j(q));
    const r = await client.revokeSession({ wallet, signer: admin, session, feeToken: NATIVE } as any);
    console.log(j(r));
    return;
  }
  throw new Error("usage: quote|grant|revoke");
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 1200)); process.exit(1); });
