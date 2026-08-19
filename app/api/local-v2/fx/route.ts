import { NextRequest, NextResponse } from "next/server";

const PROVIDER_URL = "https://open.er-api.com/v6/latest";

type ProviderResponse = {
  result: "success" | "error";
  base_code?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
  time_next_update_utc?: string;
  provider?: string;
  [key: string]: unknown;
};

export async function GET(request: NextRequest) {
  const requested = (request.nextUrl.searchParams.get("currency") || "AUD").toUpperCase();

  try {
    const response = await fetch(`${PROVIDER_URL}/${encodeURIComponent(requested)}`, {
      next: { revalidate: 60 * 60 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "FX provider request failed." }, { status: 502 });
    }

    const data = (await response.json()) as ProviderResponse;
    if (data.result !== "success" || !data.rates) {
      return NextResponse.json({ error: "FX provider returned an invalid response." }, { status: 502 });
    }

    const rateToAud = data.rates.AUD;
    if (typeof rateToAud !== "number") {
      return NextResponse.json({ error: `AUD conversion is not available for ${requested}.` }, { status: 400 });
    }

    return NextResponse.json({
      fromCurrency: requested,
      toCurrency: "AUD",
      rateToAud,
      effectiveAt: data.time_last_update_utc ?? null,
      nextUpdateAt: data.time_next_update_utc ?? null,
      retrievedAt: new Date().toISOString(),
      providerName: "ExchangeRate-API Open Access",
      providerUrl: "https://www.exchangerate-api.com",
      supportedCurrencies: Object.keys(data.rates).sort(),
      status: "LIVE",
      updateCadence: "daily",
    });
  } catch {
    return NextResponse.json({ error: "Unable to retrieve the latest exchange rate." }, { status: 502 });
  }
}
