import { corridorForCountry } from "./corridors";
import { intentIsGrounded } from "./parser";
import type { Intent, Weekday } from "./types";
import { isWeekday } from "./parser";

const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

/**
 * Optional parser. With no LLM_API_KEY the agent uses the rule parser only.
 * The model is not allowed to invent amounts or addresses: the caller drops
 * any intent that is not grounded in the owner's text.
 */
export async function tryLlm(text: string): Promise<Intent | null> {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const base = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extract one payroll intent as JSON. Types: pay, allow, remove, set-cap, revoke, status, run-rules, quote, unknown. " +
              "pay: {type, payouts:[{name,country,usd,memo}], weekday?}. Countries only: Brazil, Argentina, Nigeria, Indonesia, Mexico, Colombia. " +
              "usd is a decimal string copied from the user. set-cap: {type, scope: daily|session, usd}. " +
              "allow: {type, name, country, address}. quote: {type, country, usd}. Never invent a number or address.",
          },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const intent = asIntent(JSON.parse(content) as unknown);
    if (!intent || !intentIsGrounded(intent, text)) return null;
    return intent;
  } catch {
    return null;
  }
}

function asIntent(value: unknown): Intent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "revoke":
    case "status":
    case "run-rules":
    case "unknown":
      return { type: record.type };
    case "set-cap": {
      if ((record.scope !== "daily" && record.scope !== "session") || typeof record.usd !== "string") return null;
      return { type: "set-cap", scope: record.scope, usd: record.usd };
    }
    case "quote": {
      if (typeof record.country !== "string" || typeof record.usd !== "string") return null;
      if (!corridorForCountry(record.country)) return null;
      return { type: "quote", country: corridorForCountry(record.country)!.country, usd: record.usd };
    }
    case "remove":
      return typeof record.name === "string" ? { type: "remove", name: record.name } : null;
    case "allow": {
      if (typeof record.name !== "string" || typeof record.country !== "string" || typeof record.address !== "string") {
        return null;
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(record.address) || !corridorForCountry(record.country)) return null;
      return {
        type: "allow",
        name: record.name,
        country: corridorForCountry(record.country)!.country,
        address: record.address as `0x${string}`,
      };
    }
    case "pay": {
      if (!Array.isArray(record.payouts) || record.payouts.length === 0) return null;
      const payouts = [];
      for (const item of record.payouts) {
        if (!item || typeof item !== "object") return null;
        const payout = item as Record<string, unknown>;
        if (
          typeof payout.name !== "string" ||
          typeof payout.country !== "string" ||
          typeof payout.usd !== "string" ||
          typeof payout.memo !== "string"
        ) {
          return null;
        }
        const corridor = corridorForCountry(payout.country);
        if (!corridor || !/^\d+\.\d{2}$/.test(payout.usd) && !/^\d+(?:\.\d{1,2})?$/.test(payout.usd)) return null;
        payouts.push({
          name: payout.name,
          country: corridor.country,
          usd: payout.usd.includes(".") ? payout.usd : `${payout.usd}.00`,
          memo: payout.memo,
        });
      }
      const weekday = typeof record.weekday === "string" ? record.weekday.toLowerCase() : undefined;
      if (weekday && !WEEKDAYS.has(weekday)) return null;
      return weekday && isWeekday(weekday)
        ? { type: "pay", payouts, weekday: weekday as Weekday }
        : { type: "pay", payouts };
    }
    default:
      return null;
  }
}
