# UniPath V2 — Currency Conversion Requirements

## Purpose
International students may hold their available funds in currencies other than AUD. UniPath must let the student enter the amount in their own currency while all affordability and recommendation calculations remain normalised to AUD.

## Available funds input
The Detailed Assessment and any future affordability form must contain:

1. **Available funds amount** — numeric user input.
2. **Currency** — searchable selector covering all ISO 4217 currencies supported by the configured exchange-rate provider.
3. **AUD equivalent** — read-only field calculated automatically from the selected currency and amount.
4. **Exchange rate** — show the rate used for the calculation.
5. **Rate date/time** — show when the rate was retrieved/effective.
6. **Source/status** — identify the rate provider and whether the value is LIVE, CACHED, HISTORICAL or DEMO.

Example UI:

- Available funds: `5,000,000`
- Currency: `LKR — Sri Lankan Rupee`
- AUD equivalent: `A$xx,xxx.xx`
- Rate: `1 LKR = x.xxxxxx AUD`
- Rate updated: `<date/time>`

The AUD value must update automatically whenever the user changes either the amount or currency.

## Calculation rules
- Store the original amount and original currency as entered by the student.
- Store the converted AUD amount used by the recommendation/affordability engine.
- Store the exchange rate, provider, retrieved timestamp and effective date used for that conversion.
- All internal course affordability calculations use AUD.
- Do not use binary floating-point arithmetic for persisted money. Store money in minor units or a decimal/numeric database type.
- Exchange rates may require decimal precision beyond two places; retain sufficient precision for reproducibility.
- Re-running an assessment on another day may produce a different AUD equivalent. Existing saved results must retain the rate snapshot originally used so old calculations remain reproducible.

## Freshness and failure behaviour
- In production, request the most recent available exchange rate when the form is loaded and when the currency is changed, subject to sensible caching/rate limits.
- Clearly display the rate date. Do not describe a stale rate as current.
- If the live provider is temporarily unavailable, use the most recent valid cached rate only if its age is clearly shown.
- If no valid rate exists, do not guess. Tell the user conversion is temporarily unavailable and prevent misleading affordability calculations.

## Architecture
Currency conversion must use a provider abstraction rather than embedding an exchange-rate vendor in UI or recommendation logic.

```ts
interface ExchangeRateProvider {
  getRate(fromCurrency: string, toCurrency: "AUD", at?: Date): Promise<ExchangeRateQuote>;
}
```

`ExchangeRateQuote` must include:
- fromCurrency
- toCurrency
- rate
- effectiveAt
- retrievedAt
- providerName
- status

Local development uses deterministic DEMO rates. Stage B/production replaces this with a real exchange-rate adapter without changing domain calculations.

## Required user journey
`Detailed Assessment → Available Funds Amount + Currency → Automatic AUD Equivalent → Detailed Result / Cost Engine`

The same currency-aware input should be reused anywhere UniPath asks for:
- total available funds
- annual tuition budget, if entered in the student's home currency
- family financial support
- emergency reserve
- any other user-supplied financial capacity value

University fees and Australian living costs remain displayed primarily in AUD, with optional user-currency equivalents as a later presentation feature.

## Acceptance criteria
- User can choose a supported world currency.
- User enters an amount in that currency.
- AUD equivalent updates automatically.
- Rate, source and date are visible.
- Original currency amount and AUD normalised value are both retained.
- Affordability calculations consume the AUD value, not the raw foreign-currency amount.
- Saved assessments retain the exact exchange-rate snapshot used.
- Local mode clearly labels fixture rates as DEMO and never presents them as current market rates.
