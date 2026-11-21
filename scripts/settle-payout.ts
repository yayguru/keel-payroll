import { corridorForCountry } from "../lib/corridors";
import { settlePayout } from "../lib/settle";
import { usdToUnits } from "../lib/money";

async function main() {
  const country = process.env.PAYEE_COUNTRY ?? "Brazil";
  const corridor = corridorForCountry(country);
  const guard = process.env.PAYROLL_GUARD_ADDRESS as `0x${string}` | undefined;
  const payee = process.env.PAYEE_ADDRESS as `0x${string}` | undefined;
  const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
  const usd = process.env.PAYOUT_USD ?? "1.00";
  if (!corridor || !guard || !payee || !key) {
    console.log("Dry run. Required to settle: PAYROLL_GUARD_ADDRESS, PAYEE_ADDRESS, AGENT_PRIVATE_KEY, CELO_RPC_URL.");
    console.log("Optional: TEXTILE_API_KEY (skips takerProof), PAYOUT_USD, PAYEE_COUNTRY, SEND=1, I_UNDERSTAND_MAINNET=1.");
    console.log("The guard must already hold USD₮ and be the Textile taker. The payee must be allowlisted and outside the team.");
    return;
  }
  const result = await settlePayout(
    {
      rpcUrl: process.env.CELO_RPC_URL ?? "http://127.0.0.1:18545",
      agentKey: key,
      guard,
      payee,
      corridor,
      sellAmount: usdToUnits(usd),
      apiKey: process.env.TEXTILE_API_KEY,
    },
    process.env.SEND === "1",
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
