/**
 * Revokes the Altana session. One owner transaction. After it confirms, the
 * agent's next execute reverts and the desk must treat the session as halted.
 */
import { createClient, CELO, signerFromPrivateKey, deserializeSession } from "@altananetwork/sdk";
import { readFileSync } from "node:fs";

async function main() {
  if (process.env.SEND !== "1" || process.env.I_UNDERSTAND_MAINNET !== "1") {
    console.log(
      "Dry run. Revoke is client.revokeSession({ wallet, signer: admin, session }). Set SEND=1 and I_UNDERSTAND_MAINNET=1 to broadcast. The desk halts when the guard's revoke() lands or when this session is revoked.",
    );
    return;
  }
  const ownerKey = process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  const sessionPath = process.env.SESSION_FILE;
  if (!ownerKey || !sessionPath) throw new Error("OWNER_PRIVATE_KEY and SESSION_FILE are required.");
  const stored = JSON.parse(readFileSync(sessionPath, "utf8"));
  const sessionKey = process.env.SESSION_SIGNER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!sessionKey) throw new Error("SESSION_SIGNER_PRIVATE_KEY is required to restore the session object.");
  const client = createClient({ chains: [CELO] });
  const admin = signerFromPrivateKey(ownerKey);
  const wallet = await client.createWallet({ signer: admin });
  const session = deserializeSession(stored, signerFromPrivateKey(sessionKey));
  const result = await client.revokeSession({ wallet, signer: admin, session, chainId: 42220 });
  console.log(JSON.stringify(result, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));
  console.log("Session revoked. The agent must stop. Do not retry the old key.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
