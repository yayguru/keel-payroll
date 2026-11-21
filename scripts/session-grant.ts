import { altanaSessionPlan } from "../lib/altana-plan";
import { DEMO_SESSION_EXPIRY } from "../lib/demo-state";

const cap = process.env.SESSION_CAP_USD ?? "5.00";
const expiry = Number(process.env.SESSION_EXPIRY ?? DEMO_SESSION_EXPIRY);
const plan = altanaSessionPlan(cap, expiry);

console.log(JSON.stringify(plan, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));
console.log(
  [
    "Dry run. This does not call the Altana relay.",
    "To grant on Celo, on your machine:",
    "  OWNER_PRIVATE_KEY=0x… SESSION_SIGNER_PRIVATE_KEY=0x… SEND=1 I_UNDERSTAND_MAINNET=1 npm run session:grant -- --send",
    "The send path is scripts/session-grant-send.ts and it refuses without both flags.",
    "No Altana API key exists. The SDK talks to https://relay.altana.network with the owner's key.",
  ].join("\n"),
);

if (process.argv.includes("--send")) {
  console.error("Refusing --send from the print script. Use npm run session:grant:send after you have read docs/RISKS.md.");
  process.exit(1);
}
