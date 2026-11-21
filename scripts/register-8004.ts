import {
  createPublicClient,
  decodeEventLog,
  http,
} from "viem";
import { celo } from "viem/chains";
import { identityAbi } from "../lib/guard";
import { IDENTITY_REGISTRY } from "../lib/corridors";
import { registrationDataUri } from "../lib/registration";
import { accountFromEnv } from "../lib/taker-proof";
import { agentWallet } from "../lib/wallet";
import { assertSafeRpc } from "../lib/settle";
import { attributionCode } from "../lib/constants";

const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
const publicUrl = process.env.AGENT_PUBLIC_URL ?? "http://127.0.0.1:4477";
const send = process.env.SEND === "1";

async function main() {
  const uri = registrationDataUri(publicUrl);
  console.log(`Attribution code ${attributionCode()}`);
  console.log(`Identity registry ${IDENTITY_REGISTRY}`);
  console.log(`agentURI ${uri.slice(0, 80)}… (${uri.length} chars)`);
  const account = accountFromEnv("AGENT_PRIVATE_KEY");
  if (!account) {
    console.log("Dry run. Set AGENT_PRIVATE_KEY and SEND=1 to register from the agent wallet.");
    return;
  }
  console.log(`Agent ${account.address}`);
  if (!send) {
    console.log("Dry run. SEND=1 was not set, so nothing was broadcast.");
    return;
  }
  assertSafeRpc(rpc);
  const wallet = agentWallet(account, http(rpc));
  const hash = await wallet.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityAbi,
    functionName: "register",
    args: [uri],
  });
  const publicClient = createPublicClient({ chain: celo, transport: http(rpc) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  let agentId: bigint | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: identityAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "Registered") agentId = decoded.args.agentId;
    } catch {
      continue;
    }
  }
  console.log(JSON.stringify({ hash, agentId: agentId?.toString(), status: receipt.status }, null, 2));
  if (agentId !== undefined) {
    const updated = registrationDataUri(publicUrl, Number(agentId));
    console.log("Set this URI with setAgentURI after the mint, so the file includes the agent id.");
    console.log(updated.slice(0, 96));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
