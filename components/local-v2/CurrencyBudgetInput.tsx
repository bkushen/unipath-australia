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

export function CurrencyBudgetInput({
  label = "Annual tuition budget",
  audCents,
  onAudCentsChange,
}: {
  label?: string;
  audCents: number;
  onAudCentsChange: (audCents: number) => void;
}) {
  const [currency, setCurrency] = useState("AUD");
  const [amount, setAmount] = useState(() => Math.round(audCents / 100));
  const [quote, setQuote] = useState<FxResponse | null>(null);
  const [supported, setSupported] = useState<string[]>(commonCurrencies);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const callbackRef = useRef(onAudCentsChange);

  useEffect(() => {
    callbackRef.current = onAudCentsChange;
  }, [onAudCentsChange]);

  useEffect(() => {
    if (currency === "AUD") {
      setQuote(null);
      setError("");
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
  }, [amount, audCents, currency]);

  const audValue = useMemo(() => {
    if (currency === "AUD") return amount;
    if (!quote) return audCents / 100;
    return amount * quote.rateToAud;
  }, [amount, audCents, currency, quote]);

  const currencyOptions = useMemo(() => Array.from(new Set([...commonCurrencies, ...supported])).sort(), [supported]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 650 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px", gap: 8 }}>
        <input
          type="number"
          min={0}
          step={1000}
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value) || 0)}
          style={inputStyle}
          aria-label={`${label} amount`}
        />
        <select value={currency} onChange={(event) => setCurrency(event.target.value)} style={inputStyle} aria-label="Budget currency">
          {currencyOptions.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </div>

      <div style={{ padding: 10, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 14 }}>
        <strong>AUD equivalent:</strong> {loading ? "Updating…" : formatAud(audValue)}
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
