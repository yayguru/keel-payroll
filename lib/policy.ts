import type { DeskState, Payee, Weekday } from "./types";
import { compareUsd, usdToUnits } from "./money";

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function withFreshDay(state: DeskState, now: number): DeskState {
  const key = dayKey(now);
  if (state.spentDay === key) return state;
  return { ...state, spentDay: key, spentTodayUsd: "0.00" };
}

export function findPayee(state: DeskState, name: string): Payee | undefined {
  const key = name.trim().toLowerCase();
  return state.payees.find((payee) => payee.name.toLowerCase() === key);
}

export function remainingDaily(state: DeskState): bigint {
  const cap = usdToUnits(state.dailyCapUsd);
  const spent = usdToUnits(state.spentTodayUsd);
  return cap > spent ? cap - spent : 0n;
}

export function remainingSession(state: DeskState): bigint {
  const cap = usdToUnits(state.session.spendCapUsd);
  const spent = usdToUnits(state.session.spentUsd);
  return cap > spent ? cap - spent : 0n;
}

export function sessionBlock(state: DeskState, now: number): string | undefined {
  if (state.halted || state.session.revoked) {
    return state.haltReason ?? "The session is revoked. The agent will not move money.";
  }
  if (now >= state.session.expiry * 1000) {
    return `The session expired ${new Date(state.session.expiry * 1000).toISOString()}. Grant a new one.`;
  }
  return undefined;
}

export function fitsCaps(state: DeskState, usd: string): string | undefined {
  const amount = usdToUnits(usd);
  if (amount > remainingDaily(state)) {
    return `That is $${usd} and $${state.dailyCapUsd} is the daily cap, with $${state.spentTodayUsd} already used today.`;
  }
  if (amount > remainingSession(state)) {
    return `That is $${usd} and $${state.session.spendCapUsd} is the session cap, with $${state.session.spentUsd} already used.`;
  }
  if (compareUsd(usd, "0.00") <= 0) return "The amount has to be more than zero.";
  return undefined;
}

export function weekdayName(now: number): Weekday {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    new Date(now).getUTCDay()
  ] as Weekday;
}

export function nextWeekday(weekday: Weekday, now: number): string {
  const order: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = order.indexOf(weekday);
  const today = new Date(now).getUTCDay();
  let delta = (target - today + 7) % 7;
  if (delta === 0) delta = 7;
  const date = new Date(now + delta * 86_400_000);
  return date.toISOString().slice(0, 10);
}
