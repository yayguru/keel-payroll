import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleMessage } from "../lib/agent";
import { seedState } from "../lib/demo-state";
import type { PreviewResult } from "../lib/types";

const NOW = Date.UTC(2026, 10, 21, 15, 0, 0);

function previewFor(country: string, usd: string): Promise<PreviewResult> {
  const token = country === "Argentina" ? "wARS" : country === "Nigeria" ? "cNGN" : "wBRL";
  return Promise.resolve({
    ok: true,
    sellAmount: "100000",
    buyAmount: "592000000000000000",
    takerPays: "100000",
    feeAmount: "19",
    local: usd === "0.20" ? "1.184" : "0.592",
    rate: "5.9206",
    token,
  });
}

describe("agent desk", () => {
  it("simulates the sample payroll and moves the cap meter", async () => {
    const result = await handleMessage({
      message: "pay Maria (Brazil) $0.10 for the translation, Juan (Argentina) $0.20 for testing",
      state: seedState(NOW),
      now: NOW,
      mode: "mock",
      preview: previewFor,
    });
    assert.equal(result.parser, "rules");
    assert.match(result.reply, /Maria/);
    assert.match(result.reply, /Juan/);
    assert.match(result.reply, /Simulated/);
    assert.equal(result.state.spentTodayUsd, "0.30");
    assert.equal(result.state.receipts.length, 2);
    assert.equal(result.state.receipts[0].kind, "simulated");
    assert.equal(result.state.receipts[0].token, "wARS");
  });

  it("refuses a payee who is not allowlisted", async () => {
    const result = await handleMessage({
      message: "pay Sofia (Colombia) $0.10 for design",
      state: seedState(NOW),
      now: NOW,
      mode: "mock",
      preview: previewFor,
    });
    assert.match(result.reply, /not on the allowlist/);
    assert.equal(result.state.receipts.length, 0);
    assert.equal(result.state.spentTodayUsd, "0.00");
  });

  it("refuses a batch that breaks the daily cap", async () => {
    const state = seedState(NOW);
    state.dailyCapUsd = "0.25";
    const result = await handleMessage({
      message: "pay Maria (Brazil) $0.10 for the translation, Juan (Argentina) $0.20 for testing",
      state,
      now: NOW,
      mode: "mock",
      preview: previewFor,
    });
    assert.match(result.reply, /daily cap/);
    assert.equal(result.state.receipts.length, 0);
  });

  it("stops after revoke", async () => {
    const revoked = await handleMessage({
      message: "revoke the session",
      state: seedState(NOW),
      now: NOW,
      mode: "mock",
      preview: previewFor,
    });
    assert.equal(revoked.state.halted, true);
    assert.equal(revoked.state.session.revoked, true);
    const again = await handleMessage({
      message: "pay Maria (Brazil) $0.10 for the translation",
      state: revoked.state,
      now: NOW,
      mode: "mock",
      preview: async () => {
        throw new Error("preview must not run after revoke");
      },
    });
    assert.match(again.reply, /revoked/);
    assert.equal(again.state.receipts.length, 0);
  });

  it("saves a Friday rule without paying", async () => {
    const result = await handleMessage({
      message: "every Friday pay Maria (Brazil) $1.00 for the weekly translation",
      state: seedState(NOW),
      now: NOW,
      mode: "mock",
      preview: previewFor,
    });
    assert.equal(result.state.rules.length, 1);
    assert.equal(result.state.rules[0].weekday, "friday");
    assert.equal(result.state.receipts.length, 0);
    assert.match(result.reply, /Nothing was sent/);
  });

  it("does not call the model when no key is set", async () => {
    delete process.env.LLM_API_KEY;
    const result = await handleMessage({
      message: "status",
      state: seedState(NOW),
      now: NOW,
      mode: "mock",
      preview: previewFor,
    });
    assert.equal(result.parser, "rules");
    assert.match(result.reply, /mock mode/);
  });
});
