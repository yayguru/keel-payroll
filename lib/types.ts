import type { Corridor } from "./corridors";

export type Payee = {
  name: string;
  country: string;
  address: `0x${string}`;
  note: string;
};

export type Payout = {
  name: string;
  country: string;
  usd: string;
  memo: string;
};

export type PayrollRule = {
  id: string;
  weekday: Weekday;
  payout: Payout;
};

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type Receipt = {
  id: string;
  at: number;
  kind: "simulated" | "broadcast";
  payee: string;
  country: string;
  token: Corridor["symbol"];
  usd: string;
  local: string;
  rate: string;
  memo: string;
  hash?: string;
  explorer?: string;
  steps: string[];
};

export type SessionView = {
  rail: "altana-session";
  spendCapUsd: string;
  spentUsd: string;
  /** Contracts the session key may call. */
  allowlist: string[];
  expiry: number;
  revoked: boolean;
};

export type DeskState = {
  halted: boolean;
  haltReason?: string;
  dailyCapUsd: string;
  spentTodayUsd: string;
  spentDay: string;
  payees: Payee[];
  rules: PayrollRule[];
  receipts: Receipt[];
  session: SessionView;
};

export type PreviewOk = {
  ok: true;
  sellAmount: string;
  buyAmount: string;
  takerPays: string;
  feeAmount: string;
  local: string;
  rate: string;
  token: Corridor["symbol"];
};

export type PreviewResult = PreviewOk | { ok: false; reason: string };

export type Intent =
  | { type: "pay"; payouts: Payout[]; weekday?: Weekday }
  | { type: "allow"; name: string; country: string; address: `0x${string}` }
  | { type: "remove"; name: string }
  | { type: "set-cap"; scope: "daily" | "session"; usd: string }
  | { type: "revoke" }
  | { type: "status" }
  | { type: "run-rules" }
  | { type: "quote"; country: string; usd: string }
  | { type: "unknown" };

export type AgentResponse = {
  reply: string;
  state: DeskState;
  parser: "rules" | "llm";
  mode: "mock" | "live";
};
