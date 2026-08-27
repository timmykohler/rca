import { useState } from 'react'
import { useResultsStore } from '../hooks/useResultsStore'
import { calculateFundedRatio } from '../utils/api'
import { fmt, statusMeta } from '../utils/format'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, CartesianGrid
} from 'recharts'

// ── Built-in scenario templates ──────────────────────────────────────────────
const BASE_PLAN = {
  investor_name: 'Client',
  investor_age: 65,
  investor_gender: 'female',
  effective_income_tax_rate: 0.24,
  long_term_gains_rate: 0.15,
  portfolio_assets: [
    { label: 'Portfolio', account_type: 'traditional_ira', present_value: 1500000, cost_basis: 0 }
  ],
  spending_goals: [
    { label: 'Living Expenses', annual_amount: 80000, annual_adjustment: 0.0 }
  ],
  social_security: [
    { label: 'Social Security', owner: 'investor', annual_amount: 28000, annual_adjustment: 0.023, start_age: 67 }
  ],
  pensions: [],
  annuities: [],
  other_income: [],
  future_savings: [],
  private_assets: [],
}

const SCENARIO_TEMPLATES = [
  {
    id: 'base',
    name: 'Base Case',
    color: '#598A7D',
    description: 'Current plan as entered',
    modifications: {},
  },
  {
    id: 'spend_less',
    name: 'Reduce Spending 10%',
    color: '#059669',
    description: 'Scale all spending goals down by 10%',
    modifications: { spending_scale: 0.90 },
  },
  {
    id: 'spend_more',
    name: 'Increase Spending 10%',
    color: '#d97706',
    description: 'Scale all spending goals up by 10%',
    modifications: { spending_scale: 1.10 },
  },
  {
    id: 'delay_ss',
    name: 'Delay SS to Age 70',
    color: '#7c3aed',
    description: 'Delay Social Security to 70 (+~24% benefit)',
    modifications: { ss_start_age: 70, ss_amount_scale: 1.24 },
  },
  {
    id: 'retire_later',
    name: 'Retire 2 Years Later',
    color: '#0891b2',
    description: 'Defer spending start age by 2 years',
    modifications: { spending_start_offset: 2 },
  },
]

function applyModifications(plan, mods) {
  if (!mods || Object.keys(mods).length === 0) return plan
  const p = JSON.parse(JSON.stringify(plan))

  if (mods.spending_scale) {
    p.spending_goals = p.spending_goals.map(g => ({
      ...g, annual_amount: g.annual_amount * mods.spending_scale,
    }))
  }
  if (mods.ss_start_age) {
    p.social_security = (p.social_security || []).map(ss => ({
      ...ss,
      start_age: mods.ss_start_age,
      annual_amount: ss.annual_amount * (mods.ss_amount_scale || 1.0),
    }))
  }
  if (mods.spending_start_offset) {
    const offset = mods.spending_start_offset
    p.spending_goals = p.spending_goals.map(g => ({
      ...g,
      start_age: (g.start_age || p.investor_age) + offset,
      end_age: g.end_age ? g.end_age : undefined,
    }))
    // Extra savings during deferred years
    const extraSavings = p.spending_goals.reduce((s, g) => s + g.annual_amount, 0) * 0.5
    p.future_savings = [...(p.future_savings || []), {
      label: 'Deferred Retirement Savings',
      savings_type: 'pre-tax',
      owner: 'investor',
      annual_contribution: extraSavings,
      annual_adjustment: 0,
      start_age: p.investor_age,
      end_age: p.investor_age + offset,
    }]
  }
  return p
}

export default function ScenarioPage() {
  const { planInput } = useResultsStore()
  const activePlan = planInput || BASE_PLAN
  const [basePlanJson, setBasePlanJson] = useState(
    JSON.stringify(activePlan, null, 2)
  )
  const [jsonError, setJsonError] = useState(null)
  const [results, setResults] = useState([])
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState(null)
  const [selectedScenarios, setSelectedScenarios] = useState(
    new Set(['base', 'spend_less', 'spend_more', 'delay_ss'])
  )

  function toggleScenario(id) {
    setSelectedScenarios(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function parseBasePlan() {
    try {
      const plan = JSON.parse(basePlanJson)
      setJsonError(null)
      return plan
    } catch (e) {
      setJsonError('Invalid JSON: ' + e.message)
      return null
    }
  }

  async function runScenarios() {
    const plan = parseBasePlan()
    if (!plan) return

    setRunning(true)
    setRunError(null)
    setResults([])

    try {
      const scenariosToRun = SCENARIO_TEMPLATES.filter(s => selectedScenarios.has(s.id))
      const runs = scenariosToRun.map(async (scenario) => {
        const modified = applyModifications(plan, scenario.modifications)
        try {
          const result = await calculateFundedRatio(modified)
          return { scenario, result, error: null }
        } catch (e) {
          const msg = e?.response?.data?.detail || e.message
          return { scenario, result: null, error: typeof msg === 'string' ? msg : JSON.stringify(msg) }
        }
      })
      const outcomes = await Promise.all(runs)
      setResults(outcomes)
    } catch (e) {
      setRunError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const chartData = results
    .filter(r => r.result)
    .map(r => ({
      name: r.scenario.name,
      fr: parseFloat(r.result.funded_ratio_pct.toFixed(1)),
      fill: r.scenario.color,
    }))

  const baseResult = results.find(r => r.scenario.id === 'base')?.result

  return (
    <div className="space-y-6 max-w-5xl">
      {planInput ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 flex items-center gap-2">
          <span>✓</span>
          <span>Using <strong>{planInput.has_co_investor && planInput.co_investor_name
            ? (() => {
                const pParts = (planInput.investor_name || '').trim().split(' ')
                const cParts = (planInput.co_investor_name || '').trim().split(' ')
                return pParts[pParts.length-1] === cParts[cParts.length-1]
                  ? `${pParts[0]} and ${planInput.co_investor_name}`
                  : `${planInput.investor_name} and ${planInput.co_investor_name}`
              })()
            : planInput.investor_name || 'current plan'}</strong> as the base case.</span>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 flex items-center gap-2">
          <span>⚠</span>
          <span>No plan evaluated yet — using example data. Evaluate a plan on the Manual Input or Import tab first.</span>
        </div>
      )}
      <div>
        <h1 className="text-xl font-display font-semibold text-brand-700">Scenario Comparison</h1>
        <p className="text-sm text-slate-500 mt-1">
          Compare multiple "what-if" scenarios side by side. Edit the base plan JSON below or use the built-in example.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Base plan JSON editor */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-title">📋 Base Plan (JSON)</span>
            <button
              className="btn-secondary text-xs py-1"
              onClick={() => { setBasePlanJson(JSON.stringify(activePlan, null, 2)); setJsonError(null) }}
            >
              Reset Example
            </button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-slate-500">
              Paste any plan JSON here. Each scenario will modify this plan before running.
            </p>
            <textarea
              className="w-full h-64 rounded-md border border-slate-300 bg-slate-900 text-slate-100 font-mono text-xs p-3 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              value={basePlanJson}
              onChange={e => { setBasePlanJson(e.target.value); setJsonError(null) }}
              spellCheck={false}
            />
            {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
          </div>
        </div>

        {/* Scenario selector */}
        <div className="section-card flex flex-col">
          <div className="section-header">
            <span className="section-title">🎛 Select Scenarios</span>
          </div>
          <div className="px-5 py-4 space-y-2 flex-1">
            {SCENARIO_TEMPLATES.map(s => (
              <label
                key={s.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedScenarios.has(s.id)
                    ? 'border-brand-400 bg-brand-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedScenarios.has(s.id)}
                  onChange={() => toggleScenario(s.id)}
                  className="mt-0.5 accent-brand-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-sm font-medium text-brand-700">{s.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="px-5 pb-5 pt-2 border-t border-slate-100">
            <button
              className="btn-gold w-full justify-center"
              onClick={runScenarios}
              disabled={running || selectedScenarios.size === 0}
            >
              {running
                ? <><Spinner /> Running {selectedScenarios.size} scenario{selectedScenarios.size !== 1 ? 's' : ''}…</>
                : <>⚡ Run {selectedScenarios.size} Scenario{selectedScenarios.size !== 1 ? 's' : ''}</>
              }
            </button>
            {runError && <p className="text-xs text-red-500 mt-2">{runError}</p>}
          </div>
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="space-y-5">
          {/* Bar chart */}
          <div className="section-card p-5">
            <p className="section-title mb-1">Funded Ratio Comparison</p>
            <p className="text-xs text-slate-400 mb-4">Dashed line marks the 100% fully-funded threshold</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F9F9F9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={v => `${v}%`}
                  domain={[0, Math.max(130, ...chartData.map(d => d.fr)) + 10]}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                formatter={v => [`${v}%`, 'Funded Ratio']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid #e2e5ec' }}
              />
                <ReferenceLine
                  y={100}
                  stroke="#374151"
                  strokeDasharray="4 2"
                  label={{ value: '100%', position: 'insideTopRight', fontSize: 10, fill: '#374151' }}
                />
                <Bar dataKey="fr" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed table */}
          <div className="section-card">
            <div className="section-header">
              <span className="section-title">📊 Detailed Comparison</span>
              {baseResult && (
                <span className="text-xs text-slate-400">
                  Δ columns show change vs. Base Case
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500">Scenario</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Funded Ratio</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Total Resources</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Total Claims</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Surplus / (Deficit)</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">P(Success)</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map(({ scenario, result, error }) => {
                    if (error) {
                      return (
                        <tr key={scenario.id} className="bg-red-50">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: scenario.color }} />
                              <span className="font-medium">{scenario.name}</span>
                            </div>
                          </td>
                          <td colSpan={6} className="px-4 py-3 text-red-600 text-xs">{error}</td>
                        </tr>
                      )
                    }
                    const meta = statusMeta(result.status)
                    const isBase = scenario.id === 'base'
                    const frDelta = isBase || !baseResult ? null : result.funded_ratio_pct - baseResult.funded_ratio_pct
                    const surpDelta = isBase || !baseResult ? null : result.surplus_deficit - baseResult.surplus_deficit
                    return (
                      <tr key={scenario.id} className={`${isBase ? 'bg-slate-50 font-medium' : 'hover:bg-slate-50'} transition-colors`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: scenario.color }} />
                            <div>
                              <p className="font-medium text-brand-700">{scenario.name}</p>
                              <p className="text-xs text-slate-400">{scenario.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono font-semibold ${result.funded_ratio_pct >= 100 ? 'text-emerald-700' : result.funded_ratio_pct >= 80 ? 'text-amber-700' : 'text-red-700'}`}>
                            {result.funded_ratio_pct.toFixed(1)}%
                          </span>
                          {frDelta !== null && (
                            <span className={`ml-1.5 text-xs font-medium ${frDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {frDelta >= 0 ? '▲' : '▼'}{Math.abs(frDelta).toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt.dollar(result.resources.total_resources)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt.dollar(result.claims.total_claims)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono font-medium ${result.surplus_deficit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {result.surplus_deficit >= 0 ? '+' : ''}{fmt.dollar(result.surplus_deficit)}
                          </span>
                          {surpDelta !== null && (
                            <span className={`ml-1.5 text-xs ${surpDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {surpDelta >= 0 ? '▲' : '▼'}{fmt.dollar(Math.abs(surpDelta))}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmt.pct(result.probability_of_success)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Key insight callout */}
          {baseResult && results.filter(r => r.result).length > 1 && (
            <BestWorstCallout results={results.filter(r => r.result)} />
          )}
        </div>
      )}
    </div>
  )
}

function BestWorstCallout({ results }) {
  const sorted = [...results].sort((a, b) => b.result.funded_ratio - a.result.funded_ratio)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  if (best.scenario.id === worst.scenario.id) return null

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4">
        <p className="text-xs font-semibold text-emerald-700 mb-1">✦ Best Outcome</p>
        <p className="font-semibold text-emerald-900">{best.scenario.name}</p>
        <p className="text-2xl font-display font-bold text-emerald-700 mt-1">
          {best.result.funded_ratio_pct.toFixed(1)}%
        </p>
        <p className="text-xs text-emerald-600 mt-1">{best.scenario.description}</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Lowest Funded Ratio</p>
        <p className="font-semibold text-amber-900">{worst.scenario.name}</p>
        <p className="text-2xl font-display font-bold text-amber-700 mt-1">
          {worst.result.funded_ratio_pct.toFixed(1)}%
        </p>
        <p className="text-xs text-amber-600 mt-1">{worst.scenario.description}</p>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4A10 10 0 002 12h2z" />
    </svg>
  )
}
