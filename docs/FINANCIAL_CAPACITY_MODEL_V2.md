# UniPath V2 — Three-Stage Student Finance Model

## Purpose
UniPath must clearly separate money the student actually spends from money they may need to demonstrate for visa financial-capacity planning. The UI must never add show-money figures to actual-spend totals, because that would double-count funds intended for future use.

## Currency input
Available funds are entered as:
- amount in the user's own currency
- ISO currency selection
- automatically calculated AUD equivalent using the applicable exchange rate
- exchange-rate provider, rate and timestamp saved with the calculation

All internal affordability calculations are normalised to AUD integer cents.

## Stage 1 — Actual amount paid before visa application
This represents real cash outflow before the student lodges the visa.

Primary components:
- first-semester tuition or provider-required initial tuition payment
- OSHC / insurance
- provider application or enrolment charge when applicable
- any other compulsory provider-side amount paid before visa lodgement

Output label:
**Actual paid before visa**

This must be course/provider-specific. UniPath must not assume every provider always requires exactly the same initial payment.

## Stage 2 — Show-money / financial-capacity planning
The default UniPath planning view uses a conservative target consisting of:
- full 12-month course-fee amount
- applicable government living-cost amount
- travel allowance
- partner / child / school components where applicable

### Default behaviour
Do **not** subtract the first-semester tuition already paid from the default show-money target. This keeps the primary planning number conservative and easy for the user to understand.

Output labels:
- **UniPath conservative show-money target**
- **Your available funds (AUD)**
- **Surplus / shortfall**

### Optional "account for tuition already paid" view
Provide a user-controlled option such as:

**See how the show-money amount changes if tuition already paid is accounted for**

When enabled, UniPath displays a second figure rather than replacing the default figure:
- conservative target
- tuition already paid
- reduced comparison target
- amount reduced
- available funds
- revised surplus / shortfall

The original conservative figure remains visible at all times.

Suggested UI example:

Conservative show-money target: A$67,710

[ ] Account for first-semester tuition already paid

If enabled:
- First-semester tuition already paid: A$18,000
- Comparison target after paid tuition: A$49,710
- Reduction: A$18,000

The UI must label this as a **comparison/calculation option**, not silently present it as the only required amount.

## Stage 3 — Actual cost to reach Australia
This represents how much the student will actually have spent by the time they are ready to enter Australia.

Components:
- first-semester tuition / initial tuition payment
- OSHC / insurance
- visa application charge
- plane ticket
- compulsory provider-side pre-visa charges
- other genuine pre-travel cash costs when supported

Output label:
**Estimated actual cost to reach Australia**

The show-money balance from Stage 2 is not added to this figure.

## Per-course calculation
Every recommended course must have its own three-stage finance summary because tuition, initial payment requirements and insurance arrangements can differ.

Example comparison columns:
- actual paid before visa
- conservative show-money target
- optional reduced show-money comparison
- available funds
- surplus / shortfall
- actual cost to reach Australia

## Source and freshness rules
Production values that can change must store and display provenance, including:
- source
- source URL
- effective/retrieved date
- last verified date
- verification status

This applies especially to:
- provider first-payment requirements
- tuition fees
- OSHC
- visa application charges
- government financial-capacity amounts
- travel allowances
- exchange rates

## Safety rule
UniPath must distinguish:
1. actual cash already paid,
2. money being demonstrated or planned for financial-capacity purposes, and
3. total actual cash spent to reach Australia.

These categories must never be merged into one total.
