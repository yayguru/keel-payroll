import { corridorTargets } from "./corridors";
import { dayKey } from "./policy";
import type { DeskState } from "./types";

/** 20 Dec 2026, after the hackathon closes, so a mock session stays armed while judges read. */
export const DEMO_SESSION_EXPIRY = Math.floor(Date.UTC(2026, 11, 20, 9, 0, 0) / 1000);

export function seedState(now = Date.now()): DeskState {
  return {
    halted: false,
    dailyCapUsd: "5.00",
    spentTodayUsd: "0.00",
    spentDay: dayKey(now),
    payees: [
      {
        name: "Maria",
        country: "Brazil",
        address: "0x1111111111111111111111111111111111111111",
        note: "Demo placeholder. Replace with the contractor's wallet before mainnet.",
      },
      {
        name: "Juan",
        country: "Argentina",
        address: "0x2222222222222222222222222222222222222222",
        note: "Demo placeholder. Replace with the contractor's wallet before mainnet.",
      },
    ],
    rules: [],
    receipts: [],
    session: {
      rail: "altana-session",
      spendCapUsd: "5.00",
      spentUsd: "0.00",
      allowlist: corridorTargets().map((address) => address),
      expiry: DEMO_SESSION_EXPIRY,
      revoked: false,
    },
  };
}
