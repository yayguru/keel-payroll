import { handleMessage } from "@/lib/agent";
import { seedState } from "@/lib/demo-state";
import { previewUsdToLocal } from "@/lib/textile";
import type { DeskState } from "@/lib/types";

function mode(): "mock" | "live" {
  if (process.env.KEEL_MODE === "live" && process.env.KEEL_ALLOW_LIVE === "1") return "live";
  return "mock";
}

export async function POST(request: Request) {
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
    mode: mode(),
    preview: (country, usd) => previewUsdToLocal(country, usd, AbortSignal.timeout(20_000)),
  });
  return Response.json(result);
}
