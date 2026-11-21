import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  concat,
  createWalletClient,
  custom,
  encodeFunctionData,
  parseTransaction,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { fromDataSuffix, toDataSuffix, withAttribution } from "@celo/attribution-tags";
import { DEFAULT_ATTRIBUTION_CODE } from "../lib/constants";
import { agentWallet } from "../lib/wallet";
import { erc20Abi } from "../lib/guard";
import { signOrder, signerFromPrivateKey } from "@altananetwork/sdk";

const CODE = DEFAULT_ATTRIBUTION_CODE;

describe("withAttribution on the agent wallet", () => {
  it("puts the hackathon code on writeContract calldata", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    let seen = "0x" as Hex;
    const transport = custom({
      request: async ({ method, params }) => {
        if (method === "eth_chainId") return "0xa4ec";
        if (method === "eth_estimateGas") {
          seen = (params as [{ data: Hex }])[0].data;
          return "0x20000";
        }
        if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas") return "0x1";
        if (method === "eth_getTransactionCount") return "0x0";
        if (method === "eth_call") return "0x";
        if (method === "eth_sendRawTransaction") {
          const raw = (params as [Hex])[0];
          const parsed = parseTransaction(raw);
          seen = parsed.data ?? "0x";
          return `0x${"ab".repeat(32)}`;
        }
        if (method === "eth_getBlockByNumber") {
          return { baseFeePerGas: "0x1", gasLimit: "0x1000000" };
        }
        throw new Error(`unexpected ${method}`);
      },
    });

    const wallet = agentWallet(account, transport, celo);
    await wallet.writeContract({
      address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      abi: erc20Abi,
      functionName: "transfer",
      args: ["0x1111111111111111111111111111111111111111", 100_000n],
    });

    const decoded = fromDataSuffix(seen);
    assert.ok(decoded, "agent wallet sent untagged calldata");
    assert.ok(decoded.codes.includes(CODE));
  });

  it("merges a pre-tagged Textile swap instead of stacking suffixes", async () => {
    const account = privateKeyToAccount(`0x${"22".repeat(32)}`);
    const swap = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: ["0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3", 1_000_000n],
    });
    const client = createWalletClient({
      account,
      chain: celo,
      transport: custom({
        request: async ({ method, params }) => {
          if (method === "eth_chainId") return "0xa4ec";
          if (method === "eth_estimateGas") return "0x20000";
          if (method === "eth_gasPrice") return "0x1";
          if (method === "eth_getTransactionCount") return "0x0";
          if (method === "eth_getBlockByNumber") {
            return { baseFeePerGas: "0x1", gasLimit: "0x1000000" };
          }
          if (method === "eth_sendRawTransaction") {
            const parsed = parseTransaction((params as [Hex])[0]);
            const codes = fromDataSuffix(parsed.data ?? "0x")?.codes ?? [];
            assert.deepEqual(codes, [CODE]);
            return `0x${"cd".repeat(32)}`;
          }
          throw new Error(method);
        },
      }),
    }).extend(withAttribution(CODE));

    await client.sendTransaction({
      to: "0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3",
      data: concat([swap, toDataSuffix(CODE)]),
      value: 0n,
    });
  });
});

describe("Altana session signatures are not raw ECDSA", () => {
  it("signOrder returns the nested envelope, longer than 65 bytes", async () => {
    const signer = signerFromPrivateKey(generatePrivateKey());
    const signature = await signOrder(
      {
        walletAddress: "0x3333333333333333333333333333333333333333",
        signer,
      } as unknown as Parameters<typeof signOrder>[0],
      `0x${"ab".repeat(32)}`,
    );
    assert.notEqual((signature.length - 2) / 2, 65);
    assert.ok((signature.length - 2) / 2 > 65);
  });
});
