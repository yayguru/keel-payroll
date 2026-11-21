import { randomBytes } from "node:crypto";
import { toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/** EIP-712 challenge Textile verifies for a keyless firm quote. */
export async function signTakerControl(account: PrivateKeyAccount, taker: Address, chainId = 42220) {
  const nonce = toHex(randomBytes(32));
  const issuedAt = Date.now();
  const signature = await account.signTypedData({
    domain: { name: "Textile Taker Control", version: "1", chainId },
    types: {
      TakerControl: [
        { name: "taker", type: "address" },
        { name: "chainId", type: "uint256" },
        { name: "nonce", type: "bytes32" },
        { name: "issuedAt", type: "uint256" },
      ],
    },
    primaryType: "TakerControl",
    message: {
      taker,
      chainId: BigInt(chainId),
      nonce,
      issuedAt: BigInt(issuedAt),
    },
  });
  return { nonce, issuedAt, signature };
}

export function accountFromEnv(name: string): PrivateKeyAccount | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const key = (value.startsWith("0x") ? value : `0x${value}`) as Hex;
  return privateKeyToAccount(key);
}
