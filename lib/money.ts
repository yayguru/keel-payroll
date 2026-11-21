/** Decimal strings only. Floats are not used for money. */

export function parseDecimalToUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a decimal amount: ${value}`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`${value} has more than ${decimals} decimal places`);
  }
  const base = 10n ** BigInt(decimals);
  const fracUnits = frac.length === 0 ? 0n : BigInt(frac.padEnd(decimals, "0"));
  return BigInt(whole) * base + fracUnits;
}

export function formatUnits(amount: bigint, decimals: number, maxFrac = 6): string {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fracFull = (value % base).toString().padStart(decimals, "0");
  const frac = fracFull.slice(0, Math.min(maxFrac, decimals)).replace(/0+$/, "");
  const text = frac ? `${whole.toString()}.${frac}` : whole.toString();
  return negative ? `-${text}` : text;
}

export function formatUsd(units: bigint): string {
  const whole = units / 1_000_000n;
  const frac = (units % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toString()}.${frac}`;
}

export function usdToUnits(usd: string): bigint {
  return parseDecimalToUnits(usd, 6);
}

export function addUsd(a: string, b: string): string {
  return formatUsd(usdToUnits(a) + usdToUnits(b));
}

export function compareUsd(a: string, b: string): number {
  const left = usdToUnits(a);
  const right = usdToUnits(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Local units per 1 USD₮, as a decimal string. */
export function localPerUsd(buyAmount: bigint, buyDecimals: number, sellAmount: bigint): string {
  if (sellAmount === 0n) return "0";
  const scale = 1_000_000n;
  const num = buyAmount * 1_000_000n * scale;
  const den = sellAmount * 10n ** BigInt(buyDecimals);
  const scaled = num / den;
  return formatUnits(scaled, 6, 4);
}
