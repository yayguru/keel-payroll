# Keel Jobs: requirements

Live: https://keel-jobs.merjkerm.workers.dev. Outside testers (BR, MX, AR, CO, NG, ID) do tiny tasks and are paid
by Keel in their local stablecoin. It must work for a non-technical person on a phone, in EN / PT-BR / ES.

## Use-cases
1. **Local price.** Choosing a country shows "You'll be paid in <token>" and a live quote "$0.10 ≈ <amount> <token>".
2. **Wallet check.** A malformed address is rejected with a clear message. A valid address pasted from a wallet
   app with a stray leading or trailing space is accepted (people copy-paste from MiniPay/Valora).
3. **Language.** Switching EN → PT → ES translates every visible label, including an error already on screen.
4. **Safety.** The page never asks for a seed phrase, private key or money; the safety note is visible in all
   three languages.
5. **At least one task.** Submitting with no task answered is refused with "Answer at least one task".
