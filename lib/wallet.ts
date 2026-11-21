import { createWalletClient, type Account, type Chain, type Transport } from "viem";
import { withAttribution } from "@celo/attribution-tags";
import { celo } from "viem/chains";
import { attributionCode } from "./constants";

/**
 * The only wallet client the agent uses to send.
 * `withAttribution` tags sendTransaction and writeContract, including the
 * Textile `transactions.swap` payload when it is passed as `data`.
 */
export function agentWallet<TTransport extends Transport>(
  account: Account,
  transport: TTransport,
  chain: Chain = celo,
) {
  return createWalletClient({ account, chain, transport }).extend(withAttribution(attributionCode()));
}
