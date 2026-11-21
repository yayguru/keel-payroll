/** Issued for this hackathon entry. Every agent transaction carries it. */
export const DEFAULT_ATTRIBUTION_CODE = "celo_5bf71df0ebf6";

export const CELO_CHAIN_ID = 42220;

export const TEXTILE_API = "https://api.textilecredit.com/v2";

export const EXPLORER = "https://celoscan.io";

export function attributionCode(): string {
  const fromEnv = process.env.ATTRIBUTION_CODE?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_ATTRIBUTION_CODE;
}

export function explorerTx(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER}/address/${address}`;
}
