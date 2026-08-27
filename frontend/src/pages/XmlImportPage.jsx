import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { importMgpXml, calculateFundedRatio } from '../utils/api'
import { useResultsStore } from '../hooks/useResultsStore'
import { fmt } from '../utils/format'

const ACCT_LABELS = {
  taxable: 'Taxable', traditional_ira: 'Traditional IRA', roth_ira: 'Roth IRA',
  '401k': '401(k)', '403b': '403(b)', roth_401k: 'Roth 401(k)', other: 'Other',
}

export default function XmlImportPage() {
  const navigate = useNavigate()
  const { storeResult } = useResultsStore()
  const fileRef = useRef(null)

  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [importError, setImportError] = useState(null)
  const [calcError, setCalcError] = useState(null)
  const [plan, setPlan] = useState(null)
  const [fileName, setFileName] = useState(null)

  async function handleFile(file) {
    if (!file || !file.name.endsWith('.xml')) {
      setImportError('Please upload a valid .xml file exported from MoneyGuidePro.')
      return
    }
    setImportError(null)
    setImporting(true)
    try {
      const data = await importMgpXml(file)
      setPlan(data)
      setFileName(file.name)
    } catch (err) {
      setImportError(err?.response?.data?.detail || err.message || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  async function handleCalculate() {
    if (!plan) return
    setCalcError(null)
    setCalculating(true)
    try {
      // Strip internal import metadata before sending to API
      const { _warnings, _import_notes, ...planPayload } = plan
      const result = await calculateFundedRatio(planPayload)
      storeResult(result, planPayload)
      navigate('/results')
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Calculation failed.'
      setCalcError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setCalculating(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-display font-semibold text-brand-700">Import from MoneyGuidePro</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload an XML export from MoneyGuidePro. Fields will be mapped automatically — review before calculating.
        </p>
      </div>

      {/* Drop zone */}
      {!plan && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 cursor-pointer transition-colors ${
            dragOver
              ? 'border-brand-500 bg-brand-50'
              : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xml"
            className="hidden"
            onChange={e => handleFile(e.target.files[0])}
          />
          {importing ? (
            <>
              <div className="w-10 h-10 border-4 border-steel-200 border-t-brand-600 rounded-full animate-spin mb-4" />
              <p className="text-sm text-slate-600">Parsing XML…</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mb-4 text-2xl">
                📂
              </div>
              <p className="text-sm font-medium text-brand-700">Drop your MGP XML file here</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse</p>
              <p className="text-xs text-slate-300 mt-3">Accepts .xml exports from MoneyGuidePro</p>
            </>
          )}
        </div>
      )}

      {importError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Import Error:</strong> {importError}
        </div>
      )}

      {/* ── Parsed Plan Preview ─────────────────────────────────────────── */}
      {plan && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-600 text-lg">✓</span>
                <h2 className="font-semibold text-brand-700">Imported: {fileName}</h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Review the fields below and click Evaluate Plan to run the analysis.</p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary text-xs"
                onClick={() => { setPlan(null); setFileName(null) }}
              >
                ↩ Upload Different File
              </button>
              <button className="btn-gold" onClick={handleCalculate} disabled={calculating}>
                {calculating ? '⏳ Calculating…' : '⚡ Evaluate Plan'}
              </button>
            </div>
          </div>

          {calcError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Error:</strong> {calcError}
            </div>
          )}

          {/* Import warnings — fields that need manual review */}
          {plan._warnings?.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <span>⚠</span> Review Required Before Evaluating
              </p>
              {plan._warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}
            </div>
          )}

          {/* Client info */}
          <PreviewCard title="Client Information" icon="👤">
            <Grid2>
              <KV label="Name" value={plan.investor_name} />
              <KV label="Age" value={plan.investor_age} />
              <KV label="Gender" value={plan.investor_gender} className="capitalize" />
              <KV label="Income Tax Rate" value={fmt.pct(plan.effective_income_tax_rate)} />
              <KV label="LT Gains Rate" value={fmt.pct(plan.long_term_gains_rate)} />
              {plan.has_co_investor && (
                <>
                  <KV label="Co-Investor" value={plan.co_investor_name} />
                  <KV label="Co Age" value={plan.co_investor_age} />
                  <KV label="Co Gender" value={plan.co_investor_gender} className="capitalize" />
                </>
              )}
            </Grid2>
          </PreviewCard>

          {/* Portfolio */}
          {plan.portfolio_assets?.length > 0 && (
            <PreviewCard title={`Portfolio Assets (${plan.portfolio_assets.length})`} icon="💼">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="pb-1 text-left font-medium">Label</th>
                    <th className="pb-1 text-left font-medium">Type</th>
                    <th className="pb-1 text-right font-medium">Present Value</th>
                    <th className="pb-1 text-right font-medium">Cost Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {plan.portfolio_assets.map((a, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 text-slate-800">{a.label || '—'}</td>
                      <td className="py-1.5 pr-3 text-slate-500 text-xs">{ACCT_LABELS[a.account_type] || a.account_type}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-sm">{fmt.dollar(a.present_value)}</td>
                      <td className="py-1.5 text-right font-mono text-sm text-slate-500">{fmt.dollar(a.cost_basis)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200">
                    <td colSpan={2} className="py-1.5 text-xs font-semibold text-right pr-3 text-slate-600">Total</td>
                    <td className="py-1.5 text-right font-mono font-semibold text-brand-700">
                      {fmt.dollar(plan.portfolio_assets.reduce((s,a) => s + (a.present_value||0), 0))}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </PreviewCard>
          )}

          {/* Spending */}
          {plan.spending_goals?.length > 0 && (
            <PreviewCard title={`Spending Goals — Claims (${plan.spending_goals.length})`} icon="🎯">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="pb-1 text-left font-medium">Label</th>
                    <th className="pb-1 text-right font-medium">Annual Amount</th>
                    <th className="pb-1 text-right font-medium">Adj %</th>
                    <th className="pb-1 text-right font-medium">Start Age</th>
                    <th className="pb-1 text-right font-medium">End Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {plan.spending_goals.map((g, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3">{g.label}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{fmt.dollar(g.annual_amount)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-500">{fmt.pct(g.annual_adjustment)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-500">{g.start_age ?? '—'}</td>
                      <td className="py-1.5 text-right text-slate-500">{g.end_age ?? '100'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PreviewCard>
          )}

          {/* Income sources summary */}
          {(plan.social_security?.length > 0 || plan.pensions?.length > 0 || plan.annuities?.length > 0) && (
            <PreviewCard title="Income Sources" icon="🏛️">
              <div className="space-y-3">
                {plan.social_security?.length > 0 && (
                  <IncomeList label="Social Security" items={plan.social_security} />
                )}
                {plan.pensions?.length > 0 && (
                  <IncomeList label="Pensions" items={plan.pensions} />
                )}
                {plan.annuities?.length > 0 && (
                  <IncomeList label="Annuities" items={plan.annuities} />
                )}
              </div>
            </PreviewCard>
          )}

          {plan.future_savings?.length > 0 && (
            <PreviewCard title={`Future Savings (${plan.future_savings.length})`} icon="💰">
              <IncomeList items={plan.future_savings} amountKey="annual_contribution" />
            </PreviewCard>
          )}

          {/* Bottom CTA */}
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => { setPlan(null); setFileName(null) }}>
              ↩ Re-import
            </button>
            <button className="btn-gold px-6" onClick={handleCalculate} disabled={calculating}>
              {calculating ? '⏳ Calculating…' : '⚡ Evaluate Plan'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small preview sub-components ─────────────────────────────────────────────

function PreviewCard({ title, icon, children }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <span className="section-title">{icon && <span>{icon}</span>}{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function Grid2({ children }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-2">{children}</div>
}

function KV({ label, value, className = '' }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm font-medium text-slate-800 ${className}`}>{value ?? '—'}</p>
    </div>
  )
}

function IncomeList({ label, items = [], amountKey = 'annual_amount' }) {
  return (
    <div>
      {label && <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>}
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
            <span className="text-slate-700">{item.label || `Item ${i + 1}`}</span>
            <div className="flex items-center gap-4 text-slate-500 text-xs">
              {item.owner && <span className="capitalize">{item.owner}</span>}
              {item.start_age && <span>Starts age {item.start_age}</span>}
              <span className="font-mono font-medium text-slate-800">
                {fmt.dollar(item[amountKey] || 0)}/yr
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
