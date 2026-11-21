"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CORRIDORS } from "@/lib/corridors";
import type { AgentResponse, DeskState } from "@/lib/types";

type Line = { role: "owner" | "keel"; text: string };
type Rate = { country: string; token: string; rate: string; local: string } | { country: string; error: string };

const EXAMPLES = [
  "pay Maria (Brazil) $0.10 for the translation, Juan (Argentina) $0.20 for testing",
  "every Friday pay Maria (Brazil) $1.00 for the weekly translation",
  "quote Nigeria $1.00",
];

export function Desk({ initial }: { initial: DeskState }) {
  const [state, setState] = useState(initial);
  const [lines, setLines] = useState<Line[]>([
    {
      role: "keel",
      text: "Tell me who to pay. I check the allowlist and both caps, ask Textile what the local stablecoin costs, and only then write a receipt. This public desk does not sign.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "controls" | "tape">("chat");
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Brazil");
  const [address, setAddress] = useState("");
  const [daily, setDaily] = useState(initial.dailyCapUsd);
  const [sessionCap, setSessionCap] = useState(initial.session.spendCapUsd);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rates")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Rates ${response.status}`);
        return (await response.json()) as { rates: Rate[] };
      })
      .then((body) => {
        if (!cancelled) setRates(body.rates);
      })
      .catch(() => {
        if (!cancelled) setRates([{ country: "Textile", error: "Preview is unreachable from this server." }]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function ask(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setLines((current) => [...current, { role: "owner", text }]);
    setDraft("");
    try {
      const response = await fetch("/api/desk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, state }),
      });
      if (!response.ok) throw new Error(`Desk ${response.status}`);
      const body = (await response.json()) as AgentResponse;
      setState(body.state);
      setMode(body.mode);
      setDaily(body.state.dailyCapUsd);
      setSessionCap(body.state.session.spendCapUsd);
      setLines((current) => [...current, { role: "keel", text: body.reply }]);
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : "The desk could not answer.";
      setError(messageText);
      setLines((current) => [
        ...current,
        { role: "keel", text: `I could not finish that. ${messageText}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const halted = state.halted || state.session.revoked;
  const dailyPct = percent(state.spentTodayUsd, state.dailyCapUsd);
  const sessionPct = percent(state.session.spentUsd, state.session.spendCapUsd);

  return (
    <div className="desk-grid">
      <header className="col-span-full flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-heading text-3xl tracking-tight text-foreground">Keel Payroll</p>
          <p className="max-w-xl text-sm text-muted-foreground">
            USD₮ in. A local stablecoin out. The session can be revoked in one transaction.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{mode === "live" ? "Live" : "Mock desk"}</Badge>
          <Badge variant="outline">Celo 42220</Badge>
          <Badge variant={halted ? "destructive" : "secondary"}>{halted ? "Halted" : "Armed"}</Badge>
        </div>
      </header>

      <div className="mobile-tabs col-span-full flex gap-2 px-4 pt-3 sm:px-6">
        {(
          [
            ["chat", "Desk"],
            ["controls", "Caps"],
            ["tape", "Receipts"],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} variant={tab === id ? "default" : "outline"} size="sm" onClick={() => setTab(id)}>
            {label}
          </Button>
        ))}
      </div>

      <aside className="desk-col flex flex-col gap-4 p-4 sm:p-5" data-active={tab === "controls"}>
        <section className="panel flex flex-col gap-3 p-4">
          <h2 className="font-heading text-lg">Caps</h2>
          <Meter label="Today" spent={state.spentTodayUsd} cap={state.dailyCapUsd} pct={dailyPct} />
          <Meter label="Session" spent={state.session.spentUsd} cap={state.session.spendCapUsd} pct={sessionPct} />
          <p className="text-xs text-muted-foreground">
            Expires {new Date(state.session.expiry * 1000).toISOString().slice(0, 10)}. Allowlist{" "}
            {state.session.allowlist.length} contracts: USD₮, the Textile reactor, and the six local stables.
          </p>
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(`set the daily cap to $${daily}`);
            }}
          >
            <label className="col-span-2 text-xs text-muted-foreground" htmlFor="daily-cap">
              Daily cap, USD
            </label>
            <Input id="daily-cap" inputMode="decimal" value={daily} onChange={(event) => setDaily(event.target.value)} />
            <Button type="submit" variant="secondary" disabled={busy}>
              Set daily
            </Button>
          </form>
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(`set the session cap to $${sessionCap}`);
            }}
          >
            <label className="col-span-2 text-xs text-muted-foreground" htmlFor="session-cap">
              Session cap, USD
            </label>
            <Input
              id="session-cap"
              inputMode="decimal"
              value={sessionCap}
              onChange={(event) => setSessionCap(event.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={busy}>
              Set session
            </Button>
          </form>
        </section>

        <section className="panel flex flex-col gap-3 p-4">
          <h2 className="font-heading text-lg">Payees</h2>
          {state.payees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is allowlisted. Every payout will be refused.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {state.payees.map((payee) => (
                <li key={payee.name} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {payee.name} · {payee.country}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{shortAddress(payee.address)}</p>
                    <p className="text-xs text-muted-foreground">{payee.note}</p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void ask(`remove payee ${payee.name}`)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!/^0x[a-fA-F0-9]{40}$/.test(address.trim())) {
                setError("Payee address must be a 20-byte hex string.");
                return;
              }
              void ask(`allow ${name} (${country}) ${address.trim()}`);
              setName("");
              setAddress("");
            }}
          >
            <label className="text-xs text-muted-foreground" htmlFor="payee-name">
              Add a payee
            </label>
            <Input id="payee-name" placeholder="Sofia" value={name} onChange={(event) => setName(event.target.value)} required />
            <label className="sr-only" htmlFor="payee-country">
              Country
            </label>
            <select
              id="payee-country"
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              {CORRIDORS.map((corridor) => (
                <option key={corridor.symbol} value={corridor.country}>
                  {corridor.country} · {corridor.symbol}
                </option>
              ))}
            </select>
            <Input
              aria-label="Payee address"
              placeholder="0x…"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              required
            />
            <Button type="submit" variant="outline" disabled={busy}>
              Allow payee
            </Button>
          </form>
        </section>

        <Dialog>
          <DialogTrigger render={<Button variant="destructive" className="w-full" disabled={halted || busy} />}>
            Revoke session
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke the session</DialogTitle>
              <DialogDescription>
                The agent stops. In this mock that is immediate. On chain it is one owner transaction, and the next
                execute reverts.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={() => {
                  void ask("revoke the session");
                }}
              >
                Revoke now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </aside>

      <main className="desk-col min-h-0 flex-col gap-3 p-4 sm:p-5" data-active={tab === "chat"}>
        {halted && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="status">
            Agent halted. {state.haltReason}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {rates === null ? (
            <span className="text-xs text-muted-foreground">Asking Textile for $1 previews…</span>
          ) : (
            rates.map((rate) =>
              "error" in rate ? (
                <span key={rate.country} className="text-xs text-destructive">
                  {rate.country}: {rate.error}
                </span>
              ) : (
                <Badge key={rate.token} variant="secondary">
                  {rate.token} {rate.rate}
                </Badge>
              ),
            )
          )}
        </div>
        <div className="panel flex min-h-[320px] flex-1 flex-col gap-4 overflow-y-auto p-4" aria-live="polite">
          {lines.map((line, index) => (
            <article key={`${line.role}-${index}`} className={line.role === "owner" ? "ml-8" : "mr-8"}>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                {line.role === "owner" ? "Owner" : "Keel"}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6">{line.text}</p>
            </article>
          ))}
          {busy && <p className="text-sm text-muted-foreground">Checking the allowlist and quoting Textile…</p>}
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button key={example} variant="outline" size="sm" disabled={busy} onClick={() => void ask(example)}>
              {example.length > 42 ? `${example.slice(0, 42)}…` : example}
            </Button>
          ))}
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <label className="text-xs text-muted-foreground" htmlFor="instruction">
            Instruction
          </label>
          <Textarea
            id="instruction"
            value={draft}
            placeholder="pay Maria (Brazil) $0.10 for the translation"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(draft);
              }
            }}
          />
          <Button type="submit" disabled={busy || draft.trim().length === 0}>
            {busy ? "Working" : "Send"}
          </Button>
        </form>
      </main>

      <section className="desk-col flex flex-col gap-3 p-4 sm:p-5" data-active={tab === "tape"}>
        <h2 className="font-heading text-lg">Receipts</h2>
        {state.rules.length > 0 && (
          <div className="panel p-3 text-sm">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Rules</p>
            <ul className="flex flex-col gap-1">
              {state.rules.map((rule) => (
                <li key={rule.id}>
                  Every {rule.weekday}: {rule.payout.name} ${rule.payout.usd}
                </li>
              ))}
            </ul>
            <Button className="mt-3" variant="outline" size="sm" disabled={busy} onClick={() => void ask("run due rules")}>
              Run due rules
            </Button>
          </div>
        )}
        {state.receipts.length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">
            No payouts yet. A receipt shows the rate, the payee, and whether anything was broadcast.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {state.receipts.map((receipt) => (
              <li key={receipt.id} className="tape panel p-4 font-mono text-xs leading-5">
                <p className="font-sans text-sm font-medium">
                  {receipt.payee} · {receipt.country}
                </p>
                <p>
                  ${receipt.usd} → {receipt.local} {receipt.token}
                </p>
                <p>{receipt.rate} per USD₮ · {receipt.memo}</p>
                <p>{receipt.kind === "broadcast" ? "Broadcast" : "Simulated"}</p>
                {receipt.explorer && receipt.hash && (
                  <a className="underline" href={receipt.explorer}>
                    {receipt.hash.slice(0, 10)}…
                  </a>
                )}
                <ul className="mt-2 list-disc pl-4 text-muted-foreground">
                  {receipt.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Meter({ label, spent, cap, pct }: { label: string; spent: string; cap: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span>
          ${spent} / ${cap}
        </span>
      </div>
      <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function percent(spent: string, cap: string): number {
  const capNum = Number(cap);
  if (!Number.isFinite(capNum) || capNum <= 0) return 0;
  return Math.max(0, Math.min(100, (Number(spent) / capNum) * 100));
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
