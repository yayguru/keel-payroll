# Keel desk: requirements (source for `kane-cli context add` + `kane-cli design`)

Live (mock mode, never signs): https://keel-desk.merjkerm.workers.dev

Keel is a payroll agent. A business owner types plain English and Keel pays allowlisted contractors in their
local stablecoin on Celo, inside limits the owner controls. The public desk simulates the payout (no keys).

## Use-cases
1. **Pay an allowlisted contractor.** "pay Maria (Brazil) $0.10 for the translation" produces a simulated receipt in
   wBRL with a Textile rate, and the Today meter rises by $0.10. The same works when the owner leaves out the
   country of a payee who is already on the allowlist ("pay Maria $0.10 for the logo").
2. **Refuse anyone not on the allowlist.** Paying an unknown name sends nothing, says so, and writes no receipt.
3. **Daily cap.** The owner can lower the daily cap in Controls. A payment that would push today's total over the
   cap is refused with the cap and the amount already spent; nothing is sent.
4. **Kill switch.** "Revoke session" (Controls → confirm) stops the agent. Every later payment is refused.
5. **Quotes.** "quote Nigeria $1.00" returns a cNGN preview and states it is not a payment.
