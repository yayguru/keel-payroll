import { concat, type Hex } from "viem";
import { fromDataSuffix, toDataSuffix } from "@celo/attribution-tags";
import { attributionCode } from "./constants";

const MARKER = "80218021802180218021802180218021";

/** Append the ERC-8021 schema-0 suffix, merging if one schema-0 tag is already present. */
export function ensureAttribution(data: Hex, code = attributionCode()): Hex {
  const decoded = fromDataSuffix(data);
  if (!decoded) {
    const suffix = toDataSuffix(code);
    return data === "0x" ? suffix : concat([data, suffix]);
  }
  if (decoded.schemaId !== 0) {
    throw new Error(
      "This calldata already ends in a non-schema-0 attribution tag. Refusing to bury the hackathon code.",
    );
  }
  if (decoded.codes.includes(code)) return data;
  const stripped = stripSchema0(data);
  return concat([stripped, toDataSuffix([...decoded.codes, code])]);
}

export function tagSwapData(swapData: Hex, code = attributionCode()): Hex {
  return ensureAttribution(swapData, code);
}

function stripSchema0(data: Hex): Hex {
  const raw = data.slice(2).toLowerCase();
  const markerAt = raw.lastIndexOf(MARKER);
  if (markerAt < 0) return data;
  const schemaAt = markerAt - 2;
  const lengthAt = schemaAt - 2;
  const length = Number.parseInt(raw.slice(lengthAt, schemaAt), 16);
  const codeAt = lengthAt - length * 2;
  if (codeAt < 0) return data;
  const head = raw.slice(0, codeAt);
  return (`0x${head}`) as Hex;
}
