import { encodeFunctionData, http } from "viem";
import { accountFromEnv } from "../lib/taker-proof";
import { agentWallet } from "../lib/wallet";
import { assertSafeRpc } from "../lib/settle";
import { erc20Abi } from "../lib/guard";
import { USDT } from "../lib/corridors";
import { attributionCode, explorerTx } from "../lib/constants";
import { ensureAttribution } from "../lib/attribution";
import { fromDataSuffix } from "@celo/attribution-tags";

/**
 * A tiny tagged transaction the owner can point at a loopback anvil or, with
 * I_UNDERSTAND_MAINNET=1, at Celo. Default is a dry run that prints the suffix.
 */
async function main() {
  const data = ensureAttribution(
    encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: ["0x1111111111111111111111111111111111111111", 1n],
    }),
  );
  const decoded = fromDataSuffix(data);
  console.log(JSON.stringify({ code: attributionCode(), codes: decoded?.codes, schemaId: decoded?.schemaId }, null, 2));
  if (process.env.SEND !== "1") {
    console.log("Dry run. Nothing was broadcast.");
    return;
  }
  const rpc = process.env.CELO_RPC_URL ?? "http://127.0.0.1:18545";
  assertSafeRpc(rpc);
  const account = accountFromEnv("AGENT_PRIVATE_KEY");
  if (!account) throw new Error("AGENT_PRIVATE_KEY is required to send.");
  const wallet = agentWallet(account, http(rpc));
  const hash = await wallet.sendTransaction({
    to: USDT.address,
    data,
    value: 0n,
  });
  console.log(explorerTx(hash));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
