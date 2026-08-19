"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FxResponse = {
  fromCurrency: string;
  toCurrency: "AUD";
  rateToAud: number;
  effectiveAt: string | null;
  retrievedAt: string;
  providerName: string;
  providerUrl: string;
  supportedCurrencies: string[];
  status: "LIVE";
  updateCadence: "daily";
  error?: string;
};

const commonCurrencies = ["AUD", "LKR", "USD", "EUR", "GBP", "INR", "NZD", "CAD", "SGD", "CNY", "JPY", "AED", "SAR"];

function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return value === 0 ? "0" : "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function parseAmount(value: string) {
  const digitsOnly = value.replace(/[^0-9]/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

export function CurrencyBudgetInput({
  label = "Annual tuition budget",
  audCents,
  onAudCentsChange,
}: {
  label?: string;
  audCents: number;
  onAudCentsChange: (audCents: number) => void;
}) {
  const [currency, setCurrency] = useState("LKR");
  const [amount, setAmount] = useState(0);
  const [quote, setQuote] = useState<FxResponse | null>(null);
  const [supported, setSupported] = useState<string[]>(commonCurrencies);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceAmountReady, setSourceAmountReady] = useState(false);
  const callbackRef = useRef(onAudCentsChange);

  useEffect(() => {
    callbackRef.current = onAudCentsChange;
  }, [onAudCentsChange]);

  useEffect(() => {
    if (currency === "AUD") {
      setQuote(null);
      setError("");
      if (!sourceAmountReady) {
        setAmount(Math.round(audCents / 100));
        setSourceAmountReady(true);
        return;
      }
      const next = Math.round(amount * 100);
      if (next !== audCents) callbackRef.current(next);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/local-v2/fx?currency=${encodeURIComponent(currency)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as FxResponse;
        if (!response.ok || data.error) throw new Error(data.error || "Unable to retrieve exchange rate.");

        setQuote(data);
        if (data.supportedCurrencies?.length) setSupported(data.supportedCurrencies);

        if (!sourceAmountReady) {
          const sourceAmount = data.rateToAud > 0 ? Math.round((audCents / 100) / data.rateToAud) : 0;
          setAmount(sourceAmount);
          setSourceAmountReady(true);
          return;
        }

        const next = Math.round(amount * data.rateToAud * 100);
        if (next !== audCents) callbackRef.current(next);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [amount, audCents, currency, sourceAmountReady]);

  const audValue = useMemo(() => {
    if (currency === "AUD") return amount;
    if (!quote) return audCents / 100;
    return amount * quote.rateToAud;
  }, [amount, audCents, currency, quote]);

  const currencyOptions = useMemo(() => Array.from(new Set([...commonCurrencies, ...supported])).sort(), [supported]);

  const changeCurrency = (nextCurrency: string) => {
    setCurrency(nextCurrency);
    setQuote(null);
    setSourceAmountReady(false);
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 650 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px", gap: 8 }}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formatAmount(amount)}
          onChange={(event) => {
            setSourceAmountReady(true);
            setAmount(parseAmount(event.target.value));
          }}
          style={inputStyle}
          aria-label={`${label} amount`}
          placeholder="e.g. 5,000,000"
        />
        <select value={currency} onChange={(event) => changeCurrency(event.target.value)} style={inputStyle} aria-label="Budget currency">
          {currencyOptions.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </div>

      <div style={{ color: "#667085", fontSize: 12 }}>
        Amount shown with thousands separators for easier reading.
      </div>

      <div style={{ padding: 10, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 14 }}>
        <strong>AUD equivalent:</strong> {loading && !quote ? "Updating…" : formatAud(audValue)}
        {currency !== "AUD" && quote && (
          <div style={{ marginTop: 4, color: "#586174", fontSize: 12 }}>
            1 {currency} = {quote.rateToAud.toLocaleString("en-AU", { maximumFractionDigits: 8 })} AUD · latest daily rate effective {quote.effectiveAt ? new Date(quote.effectiveAt).toLocaleString("en-AU") : "today"}.
          </div>
        )}
        {error && <div style={{ marginTop: 4, color: "#b42318" }}>{error} The last AUD value is kept until a live rate is available.</div>}
      </div>

      {currency !== "AUD" && quote && (
        <div style={{ color: "#667085", fontSize: 11 }}>
          Rates by <a href={quote.providerUrl} target="_blank" rel="noreferrer">ExchangeRate-API</a>. Open-access rates update once daily.
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  border: "1px solid #cfd5df",
  borderRadius: 10,
  padding: "10px 11px",
  fontSize: 15,
  background: "#fff",
} as const;
