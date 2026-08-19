"use client";

import { useMemo, useState } from "react";
import { demoSupportedCurrencies, getDemoRateToAud } from "@/lib/local-v2/exchange-rate-provider";
import { calculateVisaFinance } from "@/lib/local-v2/visa-finance";

const aud = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const number = (value: number) =>
  new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(value);

export default function LocalVisaFinancePage() {
  const [availableAmount, setAvailableAmount] = useState(5_000_000);
  const [currency, setCurrency] = useState("LKR");
  const [annualTuition, setAnnualTuition] = useState(36_000);
  const [firstSemesterTuition, setFirstSemesterTuition] = useState(18_000);
  const [oshc, setOshc] = useState(1_200);
  const [visaFee, setVisaFee] = useState(2_000);
  const [planeTicket, setPlaneTicket] = useState(1_400);
  const [livingCost, setLivingCost] = useState(29_710);
  const [travelAllowance, setTravelAllowance] = useState(2_000);
  const [showReduced, setShowReduced] = useState(false);

  const rate = getDemoRateToAud(currency);
  const availableAudCents = Math.round(availableAmount * rate * 100);

  const result = useMemo(
    () =>
      calculateVisaFinance({
        annualTuitionCents: Math.round(annualTuition * 100),
        firstSemesterTuitionCents: Math.round(firstSemesterTuition * 100),
        oshcCents: Math.round(oshc * 100),
        visaFeeCents: Math.round(visaFee * 100),
        planeTicketCents: Math.round(planeTicket * 100),
        governmentLivingCostCents: Math.round(livingCost * 100),
        travelAllowanceCents: Math.round(travelAllowance * 100),
        availableFundsAudCents: availableAudCents,
      }),
    [annualTuition, firstSemesterTuition, oshc, visaFee, planeTicket, livingCost, travelAllowance, availableAudCents],
  );

  const mainGap = result.conservativeSurplusOrShortfallCents;
  const reducedGap = result.reducedSurplusOrShortfallCents;

  return (
    <main style={{ maxWidth: 1050, margin: "0 auto", padding: "32px 18px 72px", background: "#f7f9fc" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={badgeStyle}>LOCAL DEMO DATA ONLY</span>
        <h1 style={{ marginBottom: 8 }}>UniPath Visa Finance Preview</h1>
        <p style={{ maxWidth: 800, color: "#586174" }}>
          Three separate views: actual payment before visa, conservative show-money target, and total actual money spent to reach Australia.
        </p>
      </div>

      <section style={sectionStyle}>
        <h2>Available funds</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>Amount
            <input type="number" value={availableAmount} min={0} onChange={(e) => setAvailableAmount(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
              {demoSupportedCurrencies.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <div style={summaryBoxStyle}>
            <span style={mutedStyle}>AUD equivalent</span>
            <strong style={{ fontSize: 28 }}>{aud(availableAudCents)}</strong>
            <small>DEMO rate: 1 {currency} = {number(rate)} AUD</small>
          </div>
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: 16 }}>
        <h2>Course and visa inputs</h2>
        <div style={gridStyle}>
          <MoneyInput label="12-month tuition" value={annualTuition} onChange={setAnnualTuition} />
          <MoneyInput label="First-semester tuition already/expected to be paid" value={firstSemesterTuition} onChange={setFirstSemesterTuition} />
          <MoneyInput label="OSHC / insurance" value={oshc} onChange={setOshc} />
          <MoneyInput label="Visa application charge" value={visaFee} onChange={setVisaFee} />
          <MoneyInput label="Plane ticket estimate" value={planeTicket} onChange={setPlaneTicket} />
          <MoneyInput label="Government living-cost amount" value={livingCost} onChange={setLivingCost} />
          <MoneyInput label="Travel allowance used for show-money planning" value={travelAllowance} onChange={setTravelAllowance} />
        </div>
        <p style={{ ...mutedStyle, marginBottom: 0 }}>
          These values are editable DEMO inputs. Production values must come from current verified sources.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 16, marginTop: 16 }}>
        <section style={sectionStyle}>
          <div style={stepStyle}>1 · ACTUAL PAYMENT BEFORE VISA</div>
          <h2>{aud(result.beforeVisaActualSpendCents)}</h2>
          <Breakdown rows={[
            ["First-semester tuition", firstSemesterTuition],
            ["OSHC / insurance", oshc],
          ]} />
          <p style={mutedStyle}>Real payment estimate before visa lodgement for this demo course.</p>
        </section>

        <section style={sectionStyle}>
          <div style={stepStyle}>2 · SHOW-MONEY TARGET</div>
          <h2>{aud(result.conservativeShowMoneyTargetCents)}</h2>
          <Breakdown rows={[
            ["Full 12-month tuition", annualTuition],
            ["Living-cost amount", livingCost],
            ["Travel allowance", travelAllowance],
          ]} />
          <StatusLine value={mainGap} labelPositive="Above conservative target" labelNegative="Short of conservative target" />
          <button type="button" onClick={() => setShowReduced((value) => !value)} style={secondaryButtonStyle}>
            {showReduced ? "Hide paid-tuition comparison" : "See calculation after accounting for tuition already paid"}
          </button>
          {showReduced && (
            <div style={{ ...summaryBoxStyle, marginTop: 12 }}>
              <span style={mutedStyle}>Optional comparison target</span>
              <strong style={{ fontSize: 24 }}>{aud(result.reducedShowMoneyTargetCents)}</strong>
              <span>Reduction: {aud(result.amountReducedByPaidTuitionCents)}</span>
              <StatusLine value={reducedGap} labelPositive="Above comparison target" labelNegative="Short of comparison target" />
              <small style={mutedStyle}>This does not replace UniPath's conservative default target.</small>
            </div>
          )}
        </section>

        <section style={sectionStyle}>
          <div style={stepStyle}>3 · ACTUAL COST TO REACH AUSTRALIA</div>
          <h2>{aud(result.actualCostToReachAustraliaCents)}</h2>
          <Breakdown rows={[
            ["First-semester tuition", firstSemesterTuition],
            ["OSHC / insurance", oshc],
            ["Visa charge", visaFee],
            ["Plane ticket", planeTicket],
          ]} />
          <p style={mutedStyle}>This is actual spending only. Show money is not added again.</p>
        </section>
      </div>

      <section style={{ ...sectionStyle, marginTop: 16 }}>
        <h2>What UniPath will show on each course result</h2>
        <p style={{ marginBottom: 0 }}>
          Every recommended course can use its own tuition and provider payment data, so the three numbers change automatically when the student compares universities or courses.
        </p>
      </section>
    </main>
  );
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label style={labelStyle}>{label} (AUD)
      <input type="number" min={0} step={100} value={value} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle} />
    </label>
  );
}

function Breakdown({ rows }: { rows: Array<[string, number]> }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #eef1f5", paddingBottom: 7 }}>
          <span>{label}</span><strong>{aud(Math.round(value * 100))}</strong>
        </div>
      ))}
    </div>
  );
}

function StatusLine({ value, labelPositive, labelNegative }: { value: number; labelPositive: string; labelNegative: string }) {
  const positive = value >= 0;
  return (
    <div style={{ marginTop: 12, marginBottom: 12, padding: 10, borderRadius: 10, background: positive ? "#ecfdf3" : "#fff1f2" }}>
      <strong>{positive ? labelPositive : labelNegative}: {aud(Math.abs(value))}</strong>
    </div>
  );
}

const sectionStyle = { border: "1px solid #dde3ec", borderRadius: 18, padding: 20, background: "#fff" } as const;
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 } as const;
const labelStyle = { display: "grid", gap: 7, fontWeight: 650 } as const;
const inputStyle = { border: "1px solid #cfd6e1", borderRadius: 10, padding: "10px 11px", fontSize: 15, background: "#fff" } as const;
const summaryBoxStyle = { display: "grid", gap: 5, border: "1px solid #e2e7ef", borderRadius: 12, padding: 14, background: "#fafbfc" } as const;
const mutedStyle = { color: "#667085" } as const;
const badgeStyle = { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750, fontSize: 12 } as const;
const stepStyle = { color: "#315ea8", fontWeight: 800, fontSize: 12, letterSpacing: ".04em" } as const;
const secondaryButtonStyle = { border: "1px solid #b9c3d2", borderRadius: 10, padding: "9px 12px", background: "#fff", cursor: "pointer", fontWeight: 700 } as const;
