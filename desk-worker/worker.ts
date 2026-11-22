// Cloudflare Worker for the public Keel desk (mock mode: never signs, never holds keys).
// Static pages come from the Next.js static export (inlined by build.mjs); the two API routes
// run the same lib/ code as the Next.js route handlers.
import { handleMessage } from "../lib/agent";
import { seedState } from "../lib/demo-state";
import { previewAmount, previewUsdToLocal } from "../lib/textile";
import { CORRIDORS } from "../lib/corridors";
import { usdToUnits } from "../lib/money";
import type { DeskState } from "../lib/types";
// @ts-expect-error generated at build time
import { ASSETS } from "./assets.generated.js";

type Asset = { type: string; body: string; b64?: boolean };
const assets = ASSETS as Record<string, Asset>;

async function desk(request: Request): Promise<Response> {
  let body: { message?: unknown; state?: DeskState };
  try {
    body = (await request.json()) as { message?: unknown; state?: DeskState };
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > 2000) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }
  const state = body.state?.payees && body.state.session ? body.state : seedState();
  const result = await handleMessage({
    message: body.message,
    state,
    now: Date.now(),
    mode: "mock",
    preview: (country, usd) => previewUsdToLocal(country, usd, AbortSignal.timeout(20_000)),
  });
  return Response.json(result);
}

async function rates(): Promise<Response> {
  const sell = usdToUnits("1.00");
  const out = await Promise.all(
    CORRIDORS.map(async (corridor) => {
      const preview = await previewAmount(corridor, sell, AbortSignal.timeout(20_000));
      if (!preview.ok) return { country: corridor.country, token: corridor.symbol, error: preview.reason };
      return { country: corridor.country, token: corridor.symbol, rate: preview.rate, local: preview.local };
    }),
  );
  return Response.json({ rates: out }, { headers: { "cache-control": "public, max-age=60" } });
}

function serve(path: string): Response | null {
  const key = path.endsWith("/") ? `${path}index.html` : path;
  const hit = assets[key] ?? assets[`${key}.html`] ?? assets[`${key}/index.html`];
  if (!hit) return null;
  const bytes = hit.b64 ? Uint8Array.from(atob(hit.body), (c) => c.charCodeAt(0)) : hit.body;
  const immutable = key.startsWith("/_next/static/");
  return new Response(bytes, {
    headers: {
      "content-type": hit.type,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=60",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/desk" && request.method === "POST") return desk(request);
    if (url.pathname === "/api/rates" && request.method === "GET") return rates();
    if (url.pathname === "/healthz") return Response.json({ ok: true, mode: "mock" });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    return serve(url.pathname) ?? serve("/404.html") ?? new Response("Not found", { status: 404 });
  },
};
