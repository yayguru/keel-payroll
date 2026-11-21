import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeFunctionData, type Hex } from "viem";
import { fromDataSuffix, toDataSuffix } from "@celo/attribution-tags";
import { DEFAULT_ATTRIBUTION_CODE } from "../lib/constants";
import { ensureAttribution, tagSwapData } from "../lib/attribution";
import { erc20Abi, guardAbi } from "../lib/guard";

const CODE = DEFAULT_ATTRIBUTION_CODE;

describe("attribution", () => {
  it("appends the hackathon code as an ERC-8021 suffix", () => {
    const call = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: ["0x1111111111111111111111111111111111111111", 100_000n],
    });
    const tagged = ensureAttribution(call, CODE);
    const decoded = fromDataSuffix(tagged);
    assert.ok(decoded);
    assert.equal(decoded.schemaId, 0);
    assert.deepEqual(decoded.codes, [CODE]);
    assert.ok(tagged.endsWith(toDataSuffix(CODE).slice(2)));
  });

  it("tags Textile swap calldata once, even if called twice", () => {
    const swap = "0x095ea7b3000000000000000000000000000000000000000000000000000000000000abcd" as Hex;
    const once = tagSwapData(swap, CODE);
    const twice = tagSwapData(once, CODE);
    assert.equal(twice, once);
    assert.deepEqual(fromDataSuffix(twice)?.codes, [CODE]);
  });

  it("does not credit a suffix that is only inside an ABI-encoded execute wrapper", () => {
    const inner = tagSwapData("0x1234abcd", CODE);
    const outer = encodeFunctionData({
      abi: guardAbi,
      functionName: "execute",
      args: ["0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3", inner],
    });
    assert.equal(fromDataSuffix(outer), null, "indexer reading the end of the outer call misses the inner tag");
    const credited = ensureAttribution(outer, CODE);
    assert.deepEqual(fromDataSuffix(credited)?.codes, [CODE]);
  });
});
