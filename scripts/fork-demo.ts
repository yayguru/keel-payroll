import { readFileSync } from "node:fs";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  type Abi,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { fromDataSuffix } from "@celo/attribution-tags";
import { agentWallet } from "../lib/wallet";
import { DEFAULT_ATTRIBUTION_CODE } from "../lib/constants";
import { TEXTILE_REACTOR, USDT } from "../lib/corridors";
import { erc20Abi, guardAbi } from "../lib/guard";
import { previewUsdToLocal } from "../lib/textile";

const RPC = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:18545";
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const AGENT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const MARIA = "0x1111111111111111111111111111111111111111" as const;

function artifact(file: string): { abi: Abi; bytecode: Hex } {
  const json = JSON.parse(readFileSync(file, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: json.abi, bytecode: json.bytecode.object };
}

async function main() {
  const host = new URL(RPC).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("fork-demo only talks to loopback anvil.");
  }
  const publicClient = createPublicClient({ chain: celo, transport: http(RPC) });
  const version = await publicClient.request({ method: "web3_clientVersion" });
  if (!String(version).toLowerCase().includes("anvil")) {
    throw new Error(`Refusing ${version}. Start anvil --fork-url https://forno.celo.org.`);
  }

  const reactorCode = await publicClient.getBytecode({ address: TEXTILE_REACTOR });
  const usdtCode = await publicClient.getBytecode({ address: USDT.address });
  console.log(`reactor bytecode ${reactorCode ? (reactorCode.length - 2) / 2 : 0} bytes`);
  console.log(`usdt bytecode ${usdtCode ? (usdtCode.length - 2) / 2 : 0} bytes`);

  const owner = privateKeyToAccount(OWNER_KEY);
  const agent = privateKeyToAccount(AGENT_KEY);
  const ownerWallet = agentWallet(owner, http(RPC));
  const agentClient = agentWallet(agent, http(RPC));

  const mock = artifact("out/MockERC20.sol/MockERC20.json");
  const mockHash = await ownerWallet.deployContract({
    abi: mock.abi,
    bytecode: mock.bytecode,
    args: ["Mock USD", "mUSD", 6],
  });
  const mockReceipt = await publicClient.waitForTransactionReceipt({ hash: mockHash });
  const token = mockReceipt.contractAddress;
  if (!token) throw new Error("Mock token did not deploy.");

  const guardArtifact = artifact("out/PayrollGuard.sol/PayrollGuard.json");
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 86_400);
  const guardHash = await ownerWallet.deployContract({
    abi: guardArtifact.abi,
    bytecode: guardArtifact.bytecode,
    args: [owner.address, agent.address, token, 5_000_000n, expiry],
  });
  const guardReceipt = await publicClient.waitForTransactionReceipt({ hash: guardHash });
  const guard = guardReceipt.contractAddress;
  if (!guard) throw new Error("Guard did not deploy.");

  await ownerWallet.writeContract({
    address: guard,
    abi: guardAbi,
    functionName: "setTarget",
    args: [token, true],
  });
  await ownerWallet.writeContract({
    address: guard,
    abi: guardAbi,
    functionName: "setPayee",
    args: [MARIA, true],
  });

  const mintHash = await ownerWallet.writeContract({
    address: token,
    abi: mock.abi,
    functionName: "mint",
    args: [guard, 2_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const transfer = await agentClient.writeContract({
    address: guard,
    abi: guardAbi,
    functionName: "execute",
    args: [
      token,
      // Inner call is untagged. The tag has to sit on the outer transaction.
      encodeTransfer(MARIA, 100_000n),
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: transfer });
  const tx = await publicClient.getTransaction({ hash: transfer });
  const decoded = fromDataSuffix(tx.input);
  if (!decoded?.codes.includes(DEFAULT_ATTRIBUTION_CODE)) {
    throw new Error(`Attribution missing on ${transfer}. input tail ${tx.input.slice(-80)}`);
  }
  console.log(JSON.stringify({ transfer, codes: decoded.codes, schemaId: decoded.schemaId }, null, 2));

  const revokeHash = await ownerWallet.writeContract({
    address: guard,
    abi: guardAbi,
    functionName: "revoke",
  });
  await publicClient.waitForTransactionReceipt({ hash: revokeHash });
  const revokeTx = await publicClient.getTransaction({ hash: revokeHash });
  const revokeTag = fromDataSuffix(revokeTx.input);
  if (!revokeTag?.codes.includes(DEFAULT_ATTRIBUTION_CODE)) {
    throw new Error("Revoke transaction was not tagged.");
  }

  let halted = false;
  try {
    await agentClient.writeContract({
      address: guard,
      abi: guardAbi,
      functionName: "execute",
      args: [token, encodeTransfer(MARIA, 1n)],
    });
  } catch (error) {
    halted = true;
    console.log(`agent halted: ${error instanceof Error ? error.message.split("\n")[0] : "reverted"}`);
  }
  if (!halted) throw new Error("Agent was still able to execute after revoke.");

  const preview = await previewUsdToLocal("Brazil", "0.10");
  console.log(JSON.stringify({ guard, token, preview }, null, 2));
}

function encodeTransfer(to: Hex, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
