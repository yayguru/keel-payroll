import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRules } from "../lib/parser";

describe("rule parser", () => {
  it("reads a two-person payroll instruction", () => {
    const intent = parseRules("pay Maria (Brazil) $0.10 for the translation, Juan (Argentina) $0.20 for testing");
    assert.equal(intent.type, "pay");
    if (intent.type !== "pay") return;
    assert.equal(intent.payouts.length, 2);
    assert.deepEqual(intent.payouts[0], {
      name: "Maria",
      country: "Brazil",
      usd: "0.10",
      memo: "the translation",
    });
    assert.equal(intent.payouts[1].name, "Juan");
    assert.equal(intent.payouts[1].country, "Argentina");
    assert.equal(intent.payouts[1].usd, "0.20");
    assert.equal(intent.payouts[1].memo, "testing");
  });

  it("stores a weekday rule", () => {
    const intent = parseRules("every Friday pay Maria (Brazil) $1 for the weekly translation");
    assert.equal(intent.type, "pay");
    if (intent.type !== "pay") return;
    assert.equal(intent.weekday, "friday");
    assert.equal(intent.payouts[0].usd, "1.00");
  });

  it("reads caps, allow, revoke, and an unknown line", () => {
    assert.deepEqual(parseRules("set the daily cap to $5"), { type: "set-cap", scope: "daily", usd: "5.00" });
    const allow = parseRules("allow Sofia (Colombia) 0x3333333333333333333333333333333333333333");
    assert.equal(allow.type, "allow");
    assert.deepEqual(parseRules("revoke the session"), { type: "revoke" });
    assert.equal(parseRules("hello there").type, "unknown");
  });

  it("accepts the in-country form", () => {
    const intent = parseRules("pay Ada in Nigeria $1.50 for support");
    assert.equal(intent.type, "pay");
    if (intent.type !== "pay") return;
    assert.equal(intent.payouts[0].country, "Nigeria");
    assert.equal(intent.payouts[0].name, "Ada");
  });
});
