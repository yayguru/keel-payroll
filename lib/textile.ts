import type { Hex } from "viem";
import { TEXTILE_API } from "./constants";
import { corridorForCountry, USDT, type Corridor } from "./corridors";
import { formatUnits, localPerUsd, usdToUnits } from "./money";
import type { PreviewResult } from "./types";

type PreviewBody = {
  data?: {
    status?: string;
    reason?: string;
    sellAmount?: string;
    buyAmount?: string;
    takerPays?: string;
    feeAmount?: string;
  };
  error?: { message?: string; details?: { reason?: string } };
};

export async function previewUsdToLocal(country: string, usd: string, signal?: AbortSignal): Promise<PreviewResult> {
  const corridor = corridorForCountry(country);
  if (!corridor) return { ok: false, reason: `${country} is not a Textile corridor this desk pays.` };
  return previewAmount(corridor, usdToUnits(usd), signal);
}

export async function previewAmount(corridor: Corridor, sellAmount: bigint, signal?: AbortSignal): Promise<PreviewResult> {
  let response: Response;
  try {
    response = await fetch(`${TEXTILE_API}/rfq/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chainId: 42220,
        sellToken: USDT.address,
        buyToken: corridor.address,
        sellAmount: sellAmount.toString(),
      }),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Textile preview failed." };
  }

  let body: PreviewBody;
  try {
    body = (await response.json()) as PreviewBody;
  } catch {
    return { ok: false, reason: `Textile preview returned ${response.status} with no JSON.` };
  }

  if (!response.ok || body.data?.status === "no_quote" || !body.data?.buyAmount) {
    const reason = body.data?.reason ?? body.error?.details?.reason ?? body.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, reason: `Textile did not quote ${corridor.symbol}: ${reason}.` };
  }

  const buyAmount = BigInt(body.data.buyAmount);
  const sell = BigInt(body.data.sellAmount ?? sellAmount.toString());
  return {
    ok: true,
    sellAmount: sell.toString(),
    buyAmount: buyAmount.toString(),
    takerPays: body.data.takerPays ?? sell.toString(),
    feeAmount: body.data.feeAmount ?? "0",
    local: formatUnits(buyAmount, corridor.decimals, 6),
    rate: localPerUsd(buyAmount, corridor.decimals, sell),
    token: corridor.symbol,
  };
}

export type PreparedSwap = {
  approval: { to: Hex; data: Hex; value: bigint };
  swap: { to: Hex; data: Hex; value: bigint };
  rfqId: string;
  claimToken?: string;
  expiresAt: string;
  takerPays: bigint;
  buyAmount: bigint;
};

/**
 * Firm quotes need a taker that holds the sell token.
 * A partner key skips takerProof. Keyless callers must sign TakerControl.
 * This function does not broadcast.
 */
export async function requestFirmQuote(input: {
  corridor: Corridor;
  sellAmount: bigint;
  taker: Hex;
  takerProof?: { nonce: Hex; issuedAt: number; signature: Hex };
  apiKey?: string;
}): Promise<{ ok: true; quote: PreparedSwap } | { ok: false; reason: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;
  const response = await fetch(`${TEXTILE_API}/rfq/request`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      chainId: 42220,
      sellToken: USDT.address,
      buyToken: input.corridor.address,
      sellAmount: input.sellAmount.toString(),
      taker: input.taker,
      ...(input.takerProof ? { takerProof: input.takerProof } : {}),
    }),
    signal: AbortSignal.timeout(75_000),
  });
  const body = (await response.json()) as {
    data?: {
      status?: string;
      reason?: string;
      rfqId?: string;
      claimToken?: string;
      quote?: { takerPays?: string; buyAmount?: string; expiresAt?: string; reactor?: string };
      transactions?: {
        approval?: { to: string; data: string; value: string };
        swap?: { to: string; data: string; value: string };
      };
    };
    error?: { message?: string; details?: { reason?: string } };
  };
  const swap = body.data?.transactions?.swap;
  const approval = body.data?.transactions?.approval;
  if (!response.ok || body.data?.status !== "quoted" || !swap || !approval || !body.data.rfqId) {
    const reason = body.error?.details?.reason ?? body.data?.reason ?? body.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, reason };
  }
  return {
    ok: true,
    quote: {
      rfqId: body.data.rfqId,
      claimToken: body.data.claimToken,
      expiresAt: body.data.quote?.expiresAt ?? "",
      takerPays: BigInt(body.data.quote?.takerPays ?? "0"),
      buyAmount: BigInt(body.data.quote?.buyAmount ?? "0"),
      approval: { to: approval.to as Hex, data: approval.data as Hex, value: BigInt(approval.value) },
      swap: { to: swap.to as Hex, data: swap.data as Hex, value: BigInt(swap.value) },
    },
  };
}
