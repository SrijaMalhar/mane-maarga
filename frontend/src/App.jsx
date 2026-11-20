import React, { useEffect, useState } from "react";
import { post } from "./api.js";

const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

function Field({ label, value, onChange, step = 5000 }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export default function App() {
  const [cost, setCost] = useState(500000);
  const [savings, setSavings] = useState(20000);
  const [loan, setLoan] = useState(70000);
  const [ladder, setLadder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      post("/ladder", { total_cost: cost, own_savings: savings, scheme_loan: loan })
        .then((d) => { setLadder(d); setError(""); })
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [cost, savings, loan]);

  const max = ladder ? Math.max(...ladder.rungs.map((r) => r.cash_gap_before_instalment), 1) : 1;

  return (
    <main>
      <header>
        <h1>Sooru <span className="kn">ಸೂರು</span></h1>
        <p>Lend the gap, not the house. See the cash gap before each instalment.</p>
      </header>

      <section className="inputs" aria-label="House inputs">
        <Field label="House cost" value={cost} onChange={setCost} step={10000} />
        <Field label="Family savings" value={savings} onChange={setSavings} />
        <Field label="PMAY-G scheme loan (max ₹70,000)" value={loan} onChange={setLoan} step={5000} />
      </section>

      {error && <p role="alert" className="error">{error}. Is the API running on port 8000?</p>}

      {ladder && (
        <>
          <section className="summary" aria-label="Summary">
            <div><small>Subsidy</small><strong>{inr(ladder.subsidy)}</strong></div>
            <div><small>Funding gap (needs a loan)</small><strong>{inr(ladder.funding_gap)}</strong></div>
            <div><small>Peak timing gap (bridge only)</small><strong>{inr(ladder.peak_timing_gap)}</strong></div>
          </section>

          <section aria-label="Money ladder">
            <h2>Money ladder</h2>
            <table>
              <thead>
                <tr><th>Stage</th><th>Stage cost</th><th>Instalment after</th><th>Cash gap before it lands</th><th>of which timing</th></tr>
              </thead>
              <tbody>
                {ladder.rungs.map((r) => (
                  <tr key={r.stage}>
                    <td>{r.label}</td>
                    <td>{inr(r.cost)}</td>
                    <td>{inr(r.instalment_after)}</td>
                    <td>
                      <div className="bar" style={{ width: `${(r.cash_gap_before_instalment / max) * 100}%` }} />
                      {inr(r.cash_gap_before_instalment)}
                    </td>
                    <td>{inr(r.timing_gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {ladder.assumptions.length > 0 && (
            <p className="note"><b>Assumption:</b> {ladder.assumptions[0]}</p>
          )}
        </>
      )}
    </main>
  );
}
