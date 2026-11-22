import { corridorForCountry } from "./corridors";
import type { Intent, Payout, Weekday } from "./types";

const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const NAME = String.raw`[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)?`;

export function parseRules(text: string): Intent {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return { type: "unknown" };

  if (/^(revoke|stop|halt)(\s+the\s+(agent|session))?\.?$/i.test(cleaned)) {
    return { type: "revoke" };
  }
  if (/^(status|show( the)? (cap|receipts|session)|what('s| is) (left|the cap))\.?$/i.test(cleaned)) {
    return { type: "status" };
  }
  if (/^run( the)?( due)? rules\.?$/i.test(cleaned)) {
    return { type: "run-rules" };
  }

  const cap = cleaned.match(
    /^(?:set|change)\s+(?:the\s+)?(daily|session)\s+cap\s+to\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:usd|usdt|dollars?)?\.?$/i,
  );
  if (cap) {
    return { type: "set-cap", scope: cap[1].toLowerCase() === "session" ? "session" : "daily", usd: normalizeUsd(cap[2]) };
  }

  const allow = cleaned.match(
    new RegExp(String.raw`^allow\s+(${NAME})\s+\(([^)]+)\)\s+(0x[a-fA-F0-9]{40})\.?$`, "i"),
  );
  if (allow) {
    const country = corridorForCountry(allow[2]);
    if (!country) return { type: "unknown" };
    return {
      type: "allow",
      name: titleName(allow[1]),
      country: country.country,
      address: allow[3] as `0x${string}`,
    };
  }

  const remove = cleaned.match(new RegExp(String.raw`^remove(?:\s+payee)?\s+(${NAME})\.?$`, "i"));
  if (remove) return { type: "remove", name: titleName(remove[1]) };

  const quote = cleaned.match(
    /^quote\s+([A-Za-z]+)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:usd|usdt|dollars?)?\.?$/i,
  );
  if (quote && corridorForCountry(quote[1])) {
    return { type: "quote", country: corridorForCountry(quote[1])!.country, usd: normalizeUsd(quote[2]) };
  }

  const weekday = weekdayOf(cleaned);
  const payText = cleaned.replace(/\bevery\s+(?:week|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, " ");
  const payouts = extractPayouts(payText);
  if (payouts.length > 0) {
    return weekday ? { type: "pay", payouts, weekday } : { type: "pay", payouts };
  }

  return { type: "unknown" };
}

export function extractPayouts(text: string): Payout[] {
  const clauses = text
    .replace(/\s+\band\b\s+/gi, ", ")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const payouts: Payout[] = [];
  for (const raw of clauses) {
    const clause = raw.replace(/^(?:please\s+)?(?:pay|send)\s+/i, "");
    const match = clause.match(
      new RegExp(
        String.raw`^(${NAME})\s+(?:(?:\(([^)]+)\)|in\s+([A-Za-z]+))\s+)?\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:usdt|usd|dollars?)?(?:\s+for\s+(.+))?$`,
        "i",
      ),
    );
    if (!match) continue;
    const countryText = match[2] ?? match[3];
    // No country given ("pay Maria $0.10"): leave it empty; the agent fills it from the allowlist.
    const country = countryText ? corridorForCountry(countryText) : null;
    if (countryText && !country) continue;
    const memo = (match[5] ?? "payroll").replace(/\.$/, "").trim();
    payouts.push({
      name: titleName(match[1]),
      country: country ? country.country : "",
      usd: normalizeUsd(match[4]),
      memo,
    });
  }
  return payouts;
}

function weekdayOf(text: string): Weekday | undefined {
  const match = text.match(/\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (!match) return undefined;
  return match[1].toLowerCase() as Weekday;
}

export function isWeekday(value: string): value is Weekday {
  return WEEKDAYS.includes(value as Weekday);
}

function titleName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeUsd(value: string): string {
  const [whole, frac = ""] = value.split(".");
  return `${whole}.${frac.padEnd(2, "0").slice(0, 2)}`;
}

/** An LLM may not introduce an amount, address, or weekday that the owner did not type. */
export function intentIsGrounded(intent: Intent, text: string): boolean {
  const haystack = text.toLowerCase();
  if (intent.type === "pay") {
    return intent.payouts.every((payout) => haystack.includes(payout.usd.replace(/0+$/, "").replace(/\.$/, "")) || haystack.includes(payout.usd));
  }
  if (intent.type === "set-cap" || intent.type === "quote") {
    return haystack.includes(intent.usd) || haystack.includes(intent.usd.replace(/\.00$/, ""));
  }
  if (intent.type === "allow") {
    return haystack.includes(intent.address.toLowerCase());
  }
  return true;
}
