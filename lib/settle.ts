import { createPublicClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { explorerTx } from "./constants";
import { USDT, type Corridor } from "./corridors";
import { erc20Abi, guardAbi } from "./guard";
import { tagSwapData } from "./attribution";
import { agentWallet } from "./wallet";
import { requestFirmQuote } from "./textile";
import { signTakerControl } from "./taker-proof";

export type SettleInput = {
  rpcUrl: string;
  agentKey: Hex;
  guard: Address;
  payee: Address;
  corridor: Corridor;
  sellAmount: bigint;
  apiKey?: string;
  /** Local-stable units to pay out. Defaults to the full buyAmount; the rest stays in the guard. */
  payoutAmount?: bigint;
};

type Step = { label: string; to: Address; data: Hex };

/**
 * Quote, simulate, then send approve → swap → transfer.
 * Broadcasts only when `send` is true, and only through `agentWallet`
 * (`withAttribution`). A non-loopback RPC is refused unless
 * I_UNDERSTAND_MAINNET=1, which this repository never sets.
 */
export async function settlePayout(input: SettleInput, send: boolean) {
  assertSafeRpc(input.rpcUrl);
  const account = privateKeyToAccount(input.agentKey);
  const publicClient = createPublicClient({ chain: celo, transport: http(input.rpcUrl) });
  const [revoked, expiry, , , agent] = await publicClient.readContract({
    address: input.guard,
    abi: guardAbi,
    functionName: "status",
  });
  if (revoked) throw new Error("Guard is revoked. The agent has stopped.");
  if (BigInt(expiry) <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("Guard expiry has passed.");
  if (agent.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Guard agent is ${agent}, this key is ${account.address}.`);
  }
  const payeeAllowed = await publicClient.readContract({
    address: input.guard,
    abi: guardAbi,
    functionName: "allowedPayee",
    args: [input.payee],
  });
  if (!payeeAllowed) throw new Error("Payee is not allowlisted on the guard.");

  const proof = input.apiKey ? undefined : await signTakerControl(account, input.guard);
  const quoted = await requestFirmQuote({
    corridor: input.corridor,
    sellAmount: input.sellAmount,
    taker: input.guard,
    takerProof: proof,
    apiKey: input.apiKey,
  });
  if (!quoted.ok) throw new Error(`Textile firm quote: ${quoted.reason}`);

  const allowance = await publicClient.readContract({
    address: USDT.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [input.guard, quoted.quote.swap.to],
  });

  const steps: Step[] = [];
  if (allowance < quoted.quote.takerPays) {
    steps.push({
      label: "approve",
      to: quoted.quote.approval.to,
      data: quoted.quote.approval.data,
    });
  }
  steps.push({
    label: "swap",
    to: quoted.quote.swap.to,
    data: tagSwapData(quoted.quote.swap.data),
  });
  steps.push({
    label: "transfer",
    to: input.corridor.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [input.payee, input.payoutAmount && input.payoutAmount < quoted.quote.buyAmount ? input.payoutAmount : quoted.quote.buyAmount],
    }),
  });

  await publicClient.simulateContract({
    address: input.guard,
    abi: guardAbi,
    functionName: "execute",
    args: [steps[0].to, steps[0].data],
    account: account.address,
  });

  if (!send) {
    return {
      simulated: true as const,
      rfqId: quoted.quote.rfqId,
      expiresAt: quoted.quote.expiresAt,
      steps: steps.map((step) => step.label),
      note: "First call simulated. Later calls run only after the previous receipt, because the reactor pulls the allowance.",
    };
  }

  const wallet = agentWallet(account, http(input.rpcUrl));
  const hashes: { label: string; hash: Hex; explorer: string }[] = [];
  for (const step of steps) {
    if (step.label !== "approve" && quoted.quote.expiresAt && Date.now() >= Date.parse(quoted.quote.expiresAt)) {
      throw new Error("Quote expired. Request another before the swap.");
    }
    if (step.label !== "approve") {
      await publicClient.simulateContract({
        address: input.guard,
        abi: guardAbi,
        functionName: "execute",
        args: [step.to, step.data],
        account: account.address,
      });
    }
    const hash = await wallet.writeContract({
      address: input.guard,
      abi: guardAbi,
      functionName: "execute",
      args: [step.to, step.data],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    // Public RPCs are load balanced; give every backend the new state before the next simulate.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    hashes.push({ label: step.label, hash, explorer: explorerTx(hash) });
  }
  return { simulated: false as const, rfqId: quoted.quote.rfqId, takerPays: quoted.quote.takerPays.toString(), buyAmount: quoted.quote.buyAmount.toString(), hashes };
}

export function assertSafeRpc(rpcUrl: string) {
  const host = new URL(rpcUrl).hostname;
  const loopback = host === "127.0.0.1" || host === "localhost";
  if (!loopback && process.env.I_UNDERSTAND_MAINNET !== "1") {
    throw new Error("Refusing a non-loopback RPC. Set I_UNDERSTAND_MAINNET=1 only on your own machine.");
  }
}
