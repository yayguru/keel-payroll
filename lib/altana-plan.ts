import { TEXTILE_REACTOR, USDT, corridorTargets } from "./corridors";
import { usdToUnits } from "./money";

/** The session the owner grants the agent on an Altana wallet. */
export function altanaSessionPlan(dailyCapUsd: string, expiry: number) {
  return {
    expiry,
    permissions: {
      calls: corridorTargets().map((to) => ({ to })),
      spend: [
        {
          token: USDT.address,
          limit: usdToUnits(dailyCapUsd),
          period: "day" as const,
        },
      ],
    },
    notes: [
      "calls allow USD₮, the Textile reactor, and the six local stables. Nothing else.",
      "spend caps USD₮ per rolling day. Local-stable transfers still require the payee allowlist on the guard.",
      "Textile keyless takerProof does not accept this session's nested ERC-1271 signature unless Textile's checker is approved. FX settlement stays on PayrollGuard. This session is the Altana rail.",
      `Reactor ${TEXTILE_REACTOR}.`,
    ],
  };
}
