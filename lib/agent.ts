import { addUsd, compareUsd, formatUsd, usdToUnits } from "./money";
import { intentIsGrounded, parseRules } from "./parser";
import { tryLlm } from "./llm";
import {
  findPayee,
  fitsCaps,
  nextWeekday,
  sessionBlock,
  weekdayName,
  withFreshDay,
} from "./policy";
import { corridorForCountry } from "./corridors";
import type { AgentResponse, DeskState, Intent, Payee, Payout, PreviewOk, PreviewResult, Receipt } from "./types";

export type PreviewFn = (country: string, usd: string) => Promise<PreviewResult>;

export type SendFn = (input: {
  payee: Payee;
  payout: Payout;
  preview: PreviewOk;
}) => Promise<{ hash: string; explorer?: string } | { error: string }>;

const UNKNOWN =
  "I can pay an allowlisted person, quote a corridor, set the daily or session cap, allow a payee, or revoke the session. For example: pay Maria (Brazil) $0.10 for the translation, Juan (Argentina) $0.20 for testing.";

export async function handleMessage(input: {
  message: string;
  state: DeskState;
  now: number;
  mode: "mock" | "live";
  preview: PreviewFn;
  send?: SendFn;
}): Promise<AgentResponse> {
  const state = withFreshDay(input.state, input.now);
  const parsed = await chooseIntent(input.message);
  const base = { parser: parsed.parser, mode: input.mode, state };

  switch (parsed.intent.type) {
    case "unknown":
      return { ...base, reply: UNKNOWN };
    case "status":
      return { ...base, reply: statusReply(state, input.now, input.mode) };
    case "revoke":
      return revoke(state, parsed.parser, input.mode);
    case "set-cap":
      return setCap(state, parsed.intent.scope, parsed.intent.usd, parsed.parser, input.mode);
    case "allow":
      return allow(state, parsed.intent, parsed.parser, input.mode);
    case "remove":
      return remove(state, parsed.intent.name, parsed.parser, input.mode);
    case "quote":
      return quote(state, parsed.intent.country, parsed.intent.usd, input.preview, parsed.parser, input.mode);
    case "run-rules":
      return runRules(input, state, parsed.parser);
    case "pay": {
      // A known payee may be named without a country: use the one on the allowlist.
      const payouts = parsed.intent.payouts.map((payout) =>
        payout.country ? payout : { ...payout, country: findPayee(state, payout.name)?.country ?? "" },
      );
      const unknown = payouts.find((payout) => !payout.country);
      if (unknown) {
        return { ...base, reply: `${unknown.name} is not on the allowlist, so I sent nothing. Allow them with an address first.` };
      }
      if (parsed.intent.weekday) {
        return rememberRule(state, payouts, parsed.intent.weekday, input.now, parsed.parser, input.mode);
      }
      return pay(input, state, payouts, parsed.parser);
    }
    default:
      return { ...base, reply: UNKNOWN };
  }
}

async function chooseIntent(message: string): Promise<{ intent: Intent; parser: "rules" | "llm" }> {
  const rules = parseRules(message);
  if (!process.env.LLM_API_KEY) return { intent: rules, parser: "rules" };
  const llm = await tryLlm(message);
  if (llm && intentIsGrounded(llm, message)) return { intent: llm, parser: "llm" };
  return { intent: rules, parser: "rules" };
}

function revoke(state: DeskState, parser: AgentResponse["parser"], mode: AgentResponse["mode"]): AgentResponse {
  const next: DeskState = {
    ...state,
    halted: true,
    haltReason: "The owner revoked the session. The agent has stopped.",
    session: { ...state.session, revoked: true },
  };
  return {
    reply:
      mode === "live"
        ? "Revoke requested. On chain this is one owner transaction. Until that receipt is in, I will not quote or send."
        : "Session revoked. I will not quote, approve, or send. Refreshing the page starts a new mock session. On chain, revoke is one owner transaction and the next execute reverts.",
    state: next,
    parser,
    mode,
  };
}

function setCap(
  state: DeskState,
  scope: "daily" | "session",
  usd: string,
  parser: AgentResponse["parser"],
  mode: AgentResponse["mode"],
): AgentResponse {
  const next =
    scope === "daily"
      ? { ...state, dailyCapUsd: usd }
      : { ...state, session: { ...state.session, spendCapUsd: usd } };
  const chain =
    mode === "live"
      ? " The on-chain guard still uses the cap in the contract until the owner calls setDailyCap."
      : " This mock cap is what I will enforce in the desk.";
  return {
    reply: `${scope === "daily" ? "Daily" : "Session"} cap is now $${usd}.${chain}`,
    state: next,
    parser,
    mode,
  };
}

function allow(
  state: DeskState,
  intent: { name: string; country: string; address: `0x${string}` },
  parser: AgentResponse["parser"],
  mode: AgentResponse["mode"],
): AgentResponse {
  const corridor = corridorForCountry(intent.country);
  if (!corridor) {
    return {
      reply: `${intent.country} is not one of the six corridors (wBRL, wARS, cNGN, IDRX, wMXN, wCOP).`,
      state,
      parser,
      mode,
    };
  }
  const payees = [
    ...state.payees.filter((payee) => payee.name.toLowerCase() !== intent.name.toLowerCase()),
    {
      name: intent.name,
      country: corridor.country,
      address: intent.address,
      note: "Added from the desk.",
    },
  ];
  return {
    reply: `${intent.name} in ${corridor.country} is on the allowlist at ${intent.address}. ${
      mode === "live"
        ? "The guard still rejects them until the owner calls setPayee."
        : "I will pay only this address for that name."
    }`,
    state: { ...state, payees },
    parser,
    mode,
  };
}

function remove(state: DeskState, name: string, parser: AgentResponse["parser"], mode: AgentResponse["mode"]): AgentResponse {
  const payees = state.payees.filter((payee) => payee.name.toLowerCase() !== name.toLowerCase());
  if (payees.length === state.payees.length) {
    return { reply: `${name} is not on the allowlist.`, state, parser, mode };
  }
  return { reply: `${name} is off the allowlist. I will refuse a payout under that name.`, state: { ...state, payees }, parser, mode };
}

async function quote(
  state: DeskState,
  country: string,
  usd: string,
  preview: PreviewFn,
  parser: AgentResponse["parser"],
  mode: AgentResponse["mode"],
): Promise<AgentResponse> {
  const blocked = sessionBlock(state, Date.now());
  if (blocked) return { reply: blocked, state, parser, mode };
  const result = await preview(country, usd);
  if (!result.ok) return { reply: result.reason, state, parser, mode };
  return {
    reply: `$${usd} USD₮ previews as ${result.local} ${result.token} in ${country}, about ${result.rate} ${result.token} per USD₮. This is Textile's indicative price, not a firm quote and not a payment.`,
    state,
    parser,
    mode,
  };
}

function rememberRule(
  state: DeskState,
  payouts: Payout[],
  weekday: NonNullable<Extract<Intent, { type: "pay" }>["weekday"]>,
  now: number,
  parser: AgentResponse["parser"],
  mode: AgentResponse["mode"],
): AgentResponse {
  const rules = [
    ...state.rules,
    ...payouts.map((payout) => ({ id: crypto.randomUUID(), weekday, payout })),
  ];
  const when = nextWeekday(weekday, now);
  const names = payouts.map((payout) => `${payout.name} ($${payout.usd})`).join(", ");
  return {
    reply: `Saved a ${weekday} rule for ${names}. Next date is ${when}. Nothing was sent. Say “run due rules” on that day.`,
    state: { ...state, rules },
    parser,
    mode,
  };
}

async function runRules(
  input: { now: number; mode: "mock" | "live"; preview: PreviewFn; send?: SendFn },
  state: DeskState,
  parser: AgentResponse["parser"],
): Promise<AgentResponse> {
  const today = weekdayName(input.now);
  const due = state.rules.filter((rule) => rule.weekday === today);
  if (due.length === 0) {
    return {
      reply:
        state.rules.length === 0
          ? "There are no rules yet. Say “every Friday pay Maria (Brazil) $1.00 for the weekly translation”."
          : `Nothing is due on ${today}. ${state.rules.length} rule${state.rules.length === 1 ? "" : "s"} waiting.`,
      state,
      parser,
      mode: input.mode,
    };
  }
  return pay(
    input,
    state,
    due.map((rule) => rule.payout),
    parser,
  );
}

async function pay(
  input: { now: number; mode: "mock" | "live"; preview: PreviewFn; send?: SendFn },
  state: DeskState,
  payouts: Payout[],
  parser: AgentResponse["parser"],
): Promise<AgentResponse> {
  const blocked = sessionBlock(state, input.now);
  if (blocked) return { reply: blocked, state, parser, mode: input.mode };

  const resolved: { payout: Payout; payee: Payee }[] = [];
  for (const payout of payouts) {
    const payee = findPayee(state, payout.name);
    if (!payee) {
      return {
        reply: `${payout.name} is not on the allowlist, so I sent nothing. Allow them with an address first.`,
        state,
        parser,
        mode: input.mode,
      };
    }
    if (payee.country !== payout.country) {
      return {
        reply: `${payee.name} is on the allowlist as ${payee.country}, not ${payout.country}. I sent nothing.`,
        state,
        parser,
        mode: input.mode,
      };
    }
    resolved.push({ payout, payee });
  }

  const quoted: { payout: Payout; payee: Payee; preview: PreviewOk }[] = [];
  const skipped: string[] = [];
  for (const item of resolved) {
    const preview = await input.preview(item.payout.country, item.payout.usd);
    if (!preview.ok) {
      skipped.push(`${item.payee.name}: ${preview.reason}`);
      continue;
    }
    quoted.push({ ...item, preview });
  }
  if (quoted.length === 0) {
    return { reply: `${skipped.join(" ")} I sent nothing.`, state, parser, mode: input.mode };
  }

  const total = quoted.reduce((sum, item) => addUsd(sum, item.payout.usd), "0.00");
  const capError = fitsCaps(state, total);
  if (capError) return { reply: `${capError} I sent nothing.`, state, parser, mode: input.mode };

  let next = state;
  const lines: string[] = [];
  const receipts: Receipt[] = [];

  for (const item of quoted) {
    const steps = [
      `Allowlist: ${item.payee.address}`,
      `Cap: $${total} fits under $${state.dailyCapUsd} today and $${state.session.spendCapUsd} for the session`,
      `Textile preview: ${item.preview.local} ${item.preview.token} at ${item.preview.rate} per USD₮`,
    ];
    let hash: string | undefined;
    let explorer: string | undefined;
    let kind: Receipt["kind"] = "simulated";

    if (input.mode === "live" && input.send) {
      steps.push("Simulating the guard call before broadcast");
      const sent = await input.send(item);
      if ("error" in sent) {
        return {
          reply: `Simulation or broadcast stopped the run: ${sent.error} Nothing after this point was marked as paid.`,
          state: { ...next, receipts: [...receipts].reverse().concat(next.receipts).slice(0, 40) },
          parser,
          mode: input.mode,
        };
      }
      hash = sent.hash;
      explorer = sent.explorer;
      kind = "broadcast";
      steps.push(`Broadcast ${sent.hash}`);
    } else {
      steps.push("Mock desk: not broadcast");
    }

    next = {
      ...next,
      spentTodayUsd: addUsd(next.spentTodayUsd, item.payout.usd),
      session: { ...next.session, spentUsd: addUsd(next.session.spentUsd, item.payout.usd) },
    };
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      at: input.now,
      kind,
      payee: item.payee.name,
      country: item.payout.country,
      token: item.preview.token,
      usd: item.payout.usd,
      local: item.preview.local,
      rate: item.preview.rate,
      memo: item.payout.memo,
      hash,
      explorer,
      steps,
    };
    receipts.push(receipt);
    lines.push(
      `${item.payee.name} · ${item.payout.country} · $${item.payout.usd} → ${item.preview.local} ${item.preview.token} (${item.payout.memo}).`,
    );
  }

  const banner =
    input.mode === "live" && input.send
      ? "Broadcast from the guard. Each transaction carries the attribution tag."
      : "Simulated. Textile's preview is live; no transaction was signed. A funded guard would approve USD₮ to the reactor, swap, and transfer the local stablecoin.";
  const skippedLine = skipped.length > 0 ? ` Not sent: ${skipped.join(" ")}` : "";

  return {
    reply: `${lines.join(" ")}\n${banner} Spent today is now $${next.spentTodayUsd} of $${next.dailyCapUsd}.${skippedLine}`,
    state: { ...next, receipts: [...receipts].reverse().concat(next.receipts).slice(0, 40) },
    parser,
    mode: input.mode,
  };
}

function statusReply(state: DeskState, now: number, mode: "mock" | "live"): string {
  const halt = sessionBlock(state, now);
  const expiry = new Date(state.session.expiry * 1000).toISOString().slice(0, 10);
  return [
    halt ? halt : "The agent is armed.",
    `Daily cap $${state.dailyCapUsd}, used $${state.spentTodayUsd}. Session cap $${state.session.spendCapUsd}, used $${state.session.spentUsd}.`,
    `Session expiry ${expiry}. ${state.payees.length} payees. ${state.rules.length} rules. ${state.receipts.length} receipts.`,
    mode === "mock" ? "This desk is in mock mode." : "This desk is in live mode.",
    `Smallest unit check: ${formatUsd(usdToUnits(state.spentTodayUsd))} USD₮ base units accounted.`,
  ].join(" ");
}

export function sumUsd(values: string[]): string {
  return values.reduce((sum, value) => addUsd(sum, value), "0.00");
}

export function usdFits(cap: string, spent: string, next: string): boolean {
  return compareUsd(addUsd(spent, next), cap) <= 0;
}
