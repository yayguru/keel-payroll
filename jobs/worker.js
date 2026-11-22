// Keel Jobs: recruit a few real micro-payees for Keel Payroll.
// Cloudflare Worker + D1. Holds no private keys. Payouts run from the owner's
// machine (scripts/jobs-payout.ts), which marks a submission paid with its tx hash.

const COUNTRIES = {
  BR: { name: "Brazil", token: "wBRL", address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0", decimals: 18, fiat: "BRL" },
  MX: { name: "Mexico", token: "wMXN", address: "0x337E7456B420bD3481e7FA61fA9850343d610d34", decimals: 18, fiat: "MXN" },
  AR: { name: "Argentina", token: "wARS", address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D", decimals: 18, fiat: "ARS" },
  CO: { name: "Colombia", token: "wCOP", address: "0x8a1D45e102e886510e891d2Ec656a708991e2D76", decimals: 18, fiat: "COP" },
  NG: { name: "Nigeria", token: "cNGN", address: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f", decimals: 6, fiat: "NGN" },
  ID: { name: "Indonesia", token: "IDRX", address: "0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22", decimals: 2, fiat: "IDR" },
};
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const TASKS = ["rate", "rate_check", "translate"];
const MAX_PER_IP_PER_HOUR = 5;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !env.ADMIN_TOKEN_SHA256) return false;
  return timingSafeEqual(await sha256(token), env.ADMIN_TOKEN_SHA256);
}

function formatUnits(value, decimals, places = 4) {
  const v = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").slice(0, places).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

const quoteCache = new Map();
async function quote(country) {
  const c = COUNTRIES[country];
  if (!c) return { ok: false, reason: "unsupported country" };
  const hit = quoteCache.get(country);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  try {
    const r = await fetch("https://api.textilecredit.com/v2/rfq/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: 42220, sellToken: USDT, buyToken: c.address, sellAmount: "100000" }),
    });
    const body = await r.json();
    if (!r.ok || !body?.data?.buyAmount) throw new Error(body?.error?.message || `HTTP ${r.status}`);
    const value = { ok: true, country, token: c.token, fiat: c.fiat, usd: "0.10", local: formatUnits(body.data.buyAmount, c.decimals, 4), source: "Textile FX preview" };
    quoteCache.set(country, { at: Date.now(), value });
    return value;
  } catch (e) {
    return { ok: false, country, token: c.token, reason: String(e.message || e).slice(0, 120) };
  }
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const d = await r.json();
  return !!d.success;
}

function clean(s, max) {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

async function submit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const ip = request.headers.get("cf-connecting-ip") || "";
  const ipHash = (await sha256(`${ip}|keel-jobs`)).slice(0, 32);
  const now = Math.floor(Date.now() / 1000);
  // The owner's admin token lets the box run end-to-end tests without solving the captcha.
  const ownerTest = await isAdmin(request, env);

  if (!ownerTest) {
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM hits WHERE ip_hash = ? AND ts > ?").bind(ipHash, now - 3600).first();
  if ((recent?.n ?? 0) >= MAX_PER_IP_PER_HOUR) return json({ ok: false, error: "rate_limited" }, 429);
  await env.DB.prepare("INSERT INTO hits (ip_hash, ts) VALUES (?, ?)").bind(ipHash, now).run();
  await env.DB.prepare("DELETE FROM hits WHERE ts < ?").bind(now - 86400).run();

  if (!(await verifyTurnstile(env, body.turnstile, ip))) return json({ ok: false, error: "captcha" }, 400);
  }
  if (clean(body.website, 50)) return json({ ok: false, error: "spam" }, 400); // honeypot

  const handle = clean(body.handle, 60);
  const country = clean(body.country, 2).toUpperCase();
  const wallet = clean(body.wallet, 42);
  const consent = body.consent === true ? 1 : 0;
  const tasks = Array.isArray(body.tasks) ? body.tasks.filter((t) => TASKS.includes(t)) : [];
  const answers = {};
  for (const [k, v] of Object.entries(body.answers || {})) {
    if (/^[a-z_0-9]{1,24}$/.test(k)) answers[k] = clean(v, 600);
  }
  if (handle.length < 2) return json({ ok: false, error: "handle" }, 400);
  if (!COUNTRIES[country]) return json({ ok: false, error: "country" }, 400);
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet) || /^0x0{40}$/i.test(wallet)) return json({ ok: false, error: "wallet" }, 400);
  if (tasks.length === 0) return json({ ok: false, error: "tasks" }, 400);
  const filled = Object.values(answers).filter((v) => v.length >= 3).length;
  if (filled < 1) return json({ ok: false, error: "answers" }, 400);

  try {
    const r = await env.DB.prepare(
      "INSERT INTO submissions (handle, country, token, wallet, tasks, answers, consent, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(handle, country, COUNTRIES[country].token, wallet.toLowerCase(), JSON.stringify(tasks), JSON.stringify(answers), consent, ipHash).run();
    return json({ ok: true, id: r.meta?.last_row_id });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return json({ ok: false, error: "wallet_used" }, 409);
    return json({ ok: false, error: "db" }, 500);
  }
}

async function paidFeed(env) {
  const { results } = await env.DB.prepare(
    "SELECT handle, country, token, consent, amount_usd, amount_local, tx_hash, paid_at FROM submissions WHERE status = 'paid' ORDER BY paid_at DESC LIMIT 50",
  ).all();
  return json({
    ok: true,
    paid: results.map((r) => ({
      handle: r.consent ? r.handle : "anonymous",
      country: r.consent ? r.country : "—",
      token: r.token,
      amount_usd: r.amount_usd,
      amount_local: r.amount_local,
      tx: r.tx_hash,
      celoscan: r.tx_hash ? `https://celoscan.io/tx/${r.tx_hash}` : null,
      paid_at: r.paid_at,
    })),
  });
}

async function admin(request, env, url) {
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "unauthorized" }, 401);
  if (url.pathname === "/api/admin/stage" && request.method === "PUT") {
    // Redeploy helper: the owner stages a new build here; a Cloudflare API call then uploads it.
    const code = await request.text();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS _stage (body TEXT)").run();
    await env.DB.prepare("DELETE FROM _stage").run();
    await env.DB.prepare("INSERT INTO _stage VALUES (?)").bind(code).run();
    return json({ ok: true, staged: code.length });
  }
  const m = url.pathname.match(/^\/api\/admin\/submissions(?:\/(\d+))?$/);
  if (!m) return json({ ok: false, error: "not_found" }, 404);
  const id = m[1] ? Number(m[1]) : null;
  if (request.method === "GET" && !id) {
    const status = url.searchParams.get("status");
    const stmt = status
      ? env.DB.prepare("SELECT * FROM submissions WHERE status = ? ORDER BY id DESC LIMIT 200").bind(status)
      : env.DB.prepare("SELECT * FROM submissions ORDER BY id DESC LIMIT 200");
    const { results } = await stmt.all();
    return json({ ok: true, submissions: results.map(({ ip_hash, ...r }) => ({ ...r, tasks: JSON.parse(r.tasks), answers: JSON.parse(r.answers) })) });
  }
  if (request.method === "POST" && id) {
    const b = await request.json().catch(() => ({}));
    if (b.action === "approve") {
      const usd = /^0\.(0[5-9]|[1-2]\d|30)$/.test(String(b.amount_usd ?? "0.10")) ? String(b.amount_usd ?? "0.10") : null;
      if (!usd) return json({ ok: false, error: "amount_usd must be 0.05–0.30" }, 400);
      await env.DB.prepare("UPDATE submissions SET status = 'approved', amount_usd = ? WHERE id = ? AND status IN ('pending','rejected')").bind(usd, id).run();
    } else if (b.action === "reject") {
      await env.DB.prepare("UPDATE submissions SET status = 'rejected' WHERE id = ? AND status != 'paid'").bind(id).run();
    } else if (b.action === "paid") {
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(b.tx_hash || ""))) return json({ ok: false, error: "tx_hash" }, 400);
      await env.DB.prepare("UPDATE submissions SET status = 'paid', tx_hash = ?, amount_local = ?, paid_at = datetime('now') WHERE id = ? AND status = 'approved'")
        .bind(b.tx_hash, clean(b.amount_local, 40), id).run();
    } else return json({ ok: false, error: "action" }, 400);
    const row = await env.DB.prepare("SELECT id, status, amount_usd, tx_hash FROM submissions WHERE id = ?").bind(id).first();
    return json({ ok: true, submission: row });
  }
  if (request.method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM submissions WHERE id = ? AND status != 'paid'").bind(id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: "method" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sec = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };
    if (url.pathname === "/" && request.method === "GET")
      return new Response(PAGE.replace("__SITEKEY__", env.TURNSTILE_SITEKEY || ""), { headers: { "content-type": "text/html; charset=utf-8", ...sec } });
    if (url.pathname === "/admin" && request.method === "GET")
      return new Response(ADMIN, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", ...sec } });
    if (url.pathname === "/api/quote") return json(await quote(String(url.searchParams.get("c") || "").toUpperCase()));
    if (url.pathname === "/api/countries") return json({ ok: true, countries: Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, { name: v.name, token: v.token }])) });
    if (url.pathname === "/api/submit" && request.method === "POST") return submit(request, env);
    if (url.pathname === "/api/paid") return paidFeed(env);
    if (url.pathname.startsWith("/api/admin/")) return admin(request, env, url);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /admin\nDisallow: /api/\n");
    return new Response("Not found", { status: 404 });
  },
};
