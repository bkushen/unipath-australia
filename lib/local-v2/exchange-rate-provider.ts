export type ExchangeRateStatus = "DEMO" | "LIVE" | "CACHED" | "HISTORICAL";

export interface ExchangeRateQuote {
  fromCurrency: string;
  toCurrency: "AUD";
  rateToAud: number;
  effectiveAt: string;
  retrievedAt: string;
  providerName: string;
  status: ExchangeRateStatus;
}

export interface ExchangeRateProvider {
  getRate(fromCurrency: string, toCurrency?: "AUD", at?: Date): Promise<ExchangeRateQuote>;
}

/**
 * Deterministic local-development rates only.
 * These values are intentionally not current market rates and must never be shown as live data.
 */
const demoRatesToAud: Record<string, number> = {
  AUD: 1,
  USD: 1.52,
  EUR: 1.66,
  GBP: 1.93,
  NZD: 0.91,
  CAD: 1.12,
  SGD: 1.16,
  INR: 0.0182,
  LKR: 0.00495,
  CNY: 0.21,
  JPY: 0.0103,
  KRW: 0.00112,
  MYR: 0.35,
  IDR: 0.000093,
  PHP: 0.026,
  THB: 0.043,
  VND: 0.00006,
  NPR: 0.0114,
  BDT: 0.0138,
  PKR: 0.00545,
  AED: 0.414,
  SAR: 0.405,
  QAR: 0.417,
  KWD: 4.94,
  OMR: 3.95,
  ZAR: 0.084,
  NGN: 0.00102,
  KES: 0.0117,
  BRL: 0.28,
  MXN: 0.081,
};

export const demoSupportedCurrencies = Object.keys(demoRatesToAud).sort();

export class DemoExchangeRateProvider implements ExchangeRateProvider {
  async getRate(fromCurrency: string, toCurrency: "AUD" = "AUD"): Promise<ExchangeRateQuote> {
    const currency = fromCurrency.toUpperCase();
    if (toCurrency !== "AUD") throw new Error("Local V2 demo provider only converts to AUD.");

    const rateToAud = demoRatesToAud[currency];
    if (rateToAud === undefined) {
      throw new Error(`No DEMO exchange-rate fixture exists for ${currency}.`);
    }

    return {
      fromCurrency: currency,
      toCurrency: "AUD",
      rateToAud,
      effectiveAt: "2026-08-19T00:00:00Z",
      retrievedAt: "2026-08-19T00:00:00Z",
      providerName: "UniPath Local Demo FX Fixture",
      status: "DEMO",
    };
  }
}

export function convertMinorUnitsToAud(
  sourceMinorUnits: number,
  quote: ExchangeRateQuote,
): number {
  if (!Number.isFinite(sourceMinorUnits)) throw new Error("Invalid source money amount.");
  return Math.round(sourceMinorUnits * quote.rateToAud);
}
