# The Mamdani Exit

Deciding whether to leave NYC? This calculator compares what you actually keep — after **federal, state, and city taxes**, housing, cars, and cost of living — across US cities, using real **2026 progressive tax brackets** (not flat approximations).

**Live page:** https://meticulo3366.github.io/mamdani-exit/

## What it models

- 2026 federal brackets & standard deduction (post-OBBBA), SALT cap with high-income phase-down, auto standard-vs-itemized
- FICA: $184,500 Social Security wage base + 0.9% additional Medicare
- Progressive state brackets with state-specific deductions — including **NY's tax-benefit recapture**, which most calculators skip
- NYC resident brackets, CA mental-health surtax + uncapped SDI, MA millionaire surtax, Philadelphia wage tax
- First-year **NY nonresident tax on bonuses** earned from NY workdays, net of the new state's resident credit
- Cars (NYC defaults to zero) + transit passes as an explicit transportation line

Every rate lives in an editable JSON panel — when new brackets drop, paste them in. Settings persist in your browser (localStorage); nothing is sent anywhere.

## Disclaimer

Not tax advice. Rates verified July 2026 against IRS Rev. Proc. 2025-32, Tax Foundation, and SSA published figures. Rents and cost indexes are editable placeholders — bring your own quotes. Talk to a CPA before timing a move around a bonus payout.
