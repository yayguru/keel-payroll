/**
 * Grants an Altana session on Celo. Does not run unless SEND=1 and
 * I_UNDERSTAND_MAINNET=1. There is no API key. The owner's key never leaves
 * this process; the relay only sees signatures.
 */
import { createClient, CELO, signerFromPrivateKey } from "@altananetwork/sdk";
import { altanaSessionPlan } from "../lib/altana-plan";
import { DEMO_SESSION_EXPIRY } from "../lib/demo-state";

async function main() {
  if (process.env.SEND !== "1" || process.env.I_UNDERSTAND_MAINNET !== "1") {
    console.log("Not sent. Export SEND=1 and I_UNDERSTAND_MAINNET=1 on your machine.");
    return;
  }
  const ownerKey = process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  const sessionKey = process.env.SESSION_SIGNER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!ownerKey || !sessionKey) {
    throw new Error("OWNER_PRIVATE_KEY and SESSION_SIGNER_PRIVATE_KEY are required.");
  }
  const cap = process.env.SESSION_CAP_USD ?? "5.00";
  const expiry = Number(process.env.SESSION_EXPIRY ?? DEMO_SESSION_EXPIRY);
  const plan = altanaSessionPlan(cap, expiry);
  const client = createClient({ chains: [CELO] });
  const admin = signerFromPrivateKey(ownerKey);
  const sessionSigner = signerFromPrivateKey(sessionKey);
  const wallet = await client.createWallet({ signer: admin });
  const session = await client.grantSession({
    wallet,
    signer: admin,
    sessionSigner,
    permissions: plan.permissions,
    expiry,
    chainId: 42220,
    feeToken: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  });
  console.log(
    JSON.stringify(
      {
        wallet: wallet.address,
        expiry,
        transactionHash: "transactionHash" in session ? session.transactionHash : undefined,
        status: "status" in session ? session.status : undefined,
      },
      null,
      2,
    ),
  );
  console.log("Persist the session with the SDK's serializeSession. Do not commit it.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
