import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Legend, CartesianGrid, ReferenceLine
} from 'recharts'
import { useResultsStore } from '../hooks/useResultsStore'
import { fmt, statusMeta } from '../utils/format'
import { downloadReport } from '../utils/api'
import { useState, useEffect, useRef, useCallback } from 'react'

export default function ResultsPage() {
  const { result, planInput, clearResult, savePlan, savedPlans, loadPlan, deleteSavedPlan } = useResultsStore()
  const navigate = useNavigate()
  const [downloading, setDownloading] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveConfirmed, setSaveConfirmed] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  function handleSave() {
    const name = saveName.trim() || result.investor_name || 'Plan'
    savePlan(name)
    setSaveConfirmed(true)
    setSaveName('')
    setTimeout(() => { setShowSaveModal(false); setSaveConfirmed(false) }, 1200)
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <p className="text-4xl mb-4">📊</p>
        <p className="text-sm">No results yet. Run an analysis first.</p>
        <button className="btn-primary mt-4" onClick={() => navigate('/manual')}>
          Go to Input Form
        </button>
      </div>
    )
  }

  const meta = statusMeta(result.status)
  const fr = result.funded_ratio
  const frPct = result.funded_ratio_pct

  async function handleDownload() {
    if (!planInput) return
    setDownloading(true)
    try { await downloadReport(planInput) }
    catch (e) { alert('PDF generation failed: ' + (e?.response?.data?.detail || e.message)) }
    finally { setDownloading(false) }
  }

  // ── Chart data ────────────────────────────────────────────────────────────

  const res = result.resources

  // Build smart display name: "John and Jane Smith" or "John Doe and Jane Smith"
  function buildDisplayName(primary, coName, hasCo) {
    if (!hasCo || !coName) return primary
    const pParts = primary.trim().split(' ')
    const cParts = coName.trim().split(' ')
    const pLast = pParts[pParts.length - 1]
    const cLast = cParts[cParts.length - 1]
    const pFirst = pParts[0]
    const cFirst = cParts[0]
    if (pLast === cLast) {
      return `${pFirst} and ${coName}`
    }
    return `${primary} and ${coName}`
  }


  // ── Stacked bar variables — define FIRST so pie charts can reference them ──
  const resInvest  = (res.portfolio_after_tax || 0) + (res.private_assets_net || 0)
  const resAdd     = (res.social_security_pv || 0) + (res.pension_pv || 0) +
                     (res.annuity_pv || 0) + (res.other_income_pv || 0) +
                     (res.human_capital_pv || 0) + (res.retirement_income_pv || 0) +
                     (res.future_assets_pv || 0) - (res.liabilities_total || 0)

  // Split claims into essential vs desired by grouping field
  const essentialGoals    = result.claims.spending_goals.filter(g => ['essential','healthcare','housing'].includes((g.grouping||'essential').toLowerCase()))
  const discretionaryGoals = result.claims.spending_goals.filter(g => !['essential','healthcare','housing'].includes((g.grouping||'essential').toLowerCase()))
  // Fallback: if no grouping data, split 75/25
  const clmEssential = essentialGoals.length > 0
    ? essentialGoals.reduce((s, g) => s + g.pv, 0)
    : result.claims.total_claims * 0.75
  const clmDesired = discretionaryGoals.length > 0
    ? discretionaryGoals.reduce((s, g) => s + g.pv, 0)
    : result.claims.total_claims * 0.25

  const stackedBarData = [
    { name: 'Resources', investments: resInvest, additions: resAdd,     essential: 0,           desired: 0 },
    { name: 'Claims',    investments: 0,         additions: 0,          essential: clmEssential, desired: clmDesired },
  ]

  // Pie charts — defined after clmEssential/clmDesired are available
  const resourcesChartData = [
    { name: 'Current investments', value: resInvest, color: '#598A7D' },
    { name: 'Expected additions',  value: resAdd,    color: '#698D9F' },
  ].filter(d => d.value > 0)

  const claimsChartData = [
    { name: 'Essential spending', value: clmEssential, color: '#C97955' },
    { name: 'Desired spending',   value: clmDesired,   color: '#CAB688' },
  ].filter(d => d.value > 0)

  const comparisonData = [
    { name: 'Funded Ratio',       value: frPct, fill: frPct >= 100 ? '#598A7D' : frPct >= 80 ? '#CAB688' : '#939598' },
    { name: '70% Success Target', value: result.target_funded_ratio_70 * 100, fill: '#ABABAC' },
    { name: '80% Success Target', value: result.target_funded_ratio_80 * 100, fill: '#808183' },
  ]

  // ── Detailed Sankey data — individual accounts, income sources, spending goals ──
  // Build account-level rows from planInput (available in session) plus resource aggregates
  const ESSENTIAL_GROUPS = ['essential', 'healthcare', 'housing', 'home improvement', 'home_improvement']
  const isEssential = (g) => ESSENTIAL_GROUPS.includes((g || 'essential').toLowerCase())

  const sankeyData = {
    accounts: [
      res.portfolio_after_tax  > 0 && { label: 'Portfolio (after-tax)',    val: res.portfolio_after_tax,  type: 'invest' },
      res.private_assets_net   > 0 && { label: 'Private assets (net)',     val: res.private_assets_net,   type: 'invest' },
    ].filter(Boolean),
    additions: [
      res.social_security_pv   > 0 && { label: 'Social Security (PV)',     val: res.social_security_pv,   type: 'addition' },
      res.retirement_income_pv > 0 && { label: 'Retirement income (PV)',   val: res.retirement_income_pv, type: 'addition' },
      res.pension_pv           > 0 && { label: 'Pension (PV)',             val: res.pension_pv,            type: 'addition' },
      res.annuity_pv           > 0 && { label: 'Annuity (PV)',             val: res.annuity_pv,            type: 'addition' },
      res.other_income_pv      > 0 && { label: 'Other income (PV)',        val: res.other_income_pv,       type: 'addition' },
      res.future_assets_pv     > 0 && { label: 'Future assets (PV)',       val: res.future_assets_pv,      type: 'addition' },
      res.human_capital_pv     > 0 && { label: 'Future savings (PV)',      val: res.human_capital_pv,      type: 'addition' },
      res.liabilities_total    > 0 && { label: 'Liabilities',              val: -res.liabilities_total,    type: 'liability' },
    ].filter(Boolean),
    claims: result.claims.spending_goals.map(sg => ({
      label: sg.label,
      val:   sg.pv,
      type:  isEssential(sg.grouping) ? 'essential' : 'desired',
    })),
  }

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand-700">{buildDisplayName(result.investor_name, planInput?.co_investor_name, planInput?.has_co_investor)}</h1>
          {result.description && (
            <p className="text-sm text-slate-500 mt-0.5">{result.description}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <button className="btn-secondary" onClick={() => { sessionStorage.setItem('rca_hydrate_manual', '1'); navigate('/') }}>
            ← Edit Plan
          </button>
          <button className="btn-secondary" onClick={() => setShowLibrary(v => !v)}>
            📂 {showLibrary ? 'Hide' : `Saved${savedPlans.length ? ` (${savedPlans.length})` : ''}`}
          </button>
          <button className="btn-secondary" onClick={() => { setSaveConfirmed(false); setShowSaveModal(true) }}>
            💾 Save
          </button>
          <button className="btn-primary" onClick={handleDownload} disabled={downloading}>
            {downloading ? '⏳ Generating…' : '⬇ Export PDF'}
          </button>
        </div>
      </div>

      {/* ── Save Modal ───────────────────────────────────────────────────── */}
      {showSaveModal && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col gap-3">
          {saveConfirmed ? (
            <p className="text-sm text-emerald-700 font-medium">✓ Plan saved!</p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700">Save this plan to your library</p>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 text-sm"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder={result.investor_name || 'Plan name…'}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
                <button className="btn-gold text-sm" onClick={handleSave}>Save</button>
                <button className="btn-secondary text-sm" onClick={() => setShowSaveModal(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Saved Plans Library ──────────────────────────────────────────── */}
      {showLibrary && (
        <div className="section-card">
          <div className="section-header">
            <span className="section-title">📂 Saved Plans</span>
          </div>
          <div className="px-5 py-3">
            {savedPlans.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-2">No saved plans yet — click 💾 Save after evaluating.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {['Name','Funded Ratio','Surplus / (Deficit)','Saved',''].map(h =>
                      <th key={h} className="pb-1.5 text-left text-xs font-medium text-neutral-600 pr-4">{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {savedPlans.map(p => (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 font-medium text-slate-700">{p.name}</td>
                      <td className="py-2 pr-4 font-mono text-brand-600">{fmt.pctRaw(p.result.funded_ratio_pct)}</td>
                      <td className={`py-2 pr-4 font-mono ${p.result.surplus_deficit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmt.dollar(p.result.surplus_deficit)}
                      </td>
                      <td className="py-2 pr-4 text-slate-400 text-xs">
                        {new Date(p.savedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-3">
                          <button className="text-xs text-brand-600 hover:underline" onClick={() => { loadPlan(p.id); setShowLibrary(false) }}>Load</button>
                          <button className="text-xs text-red-400 hover:underline" onClick={() => deleteSavedPlan(p.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Hero metrics ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <HeroCard
          label="Funded Ratio"
          value={fmt.pctRaw(frPct)}
          sub={meta.label}
          valueClass={meta.color}
          borderClass={meta.border}
          bgClass={meta.bg}
          big
        />
        <HeroCard
          label="Surplus / (Deficit)"
          value={fmt.dollar(result.surplus_deficit)}
          sub="Resources minus Claims"
          valueClass={meta.color}
          borderClass={meta.border}
          bgClass={meta.bg}
          big
        />

      </div>

      {/* ── Key metrics — hero-card style ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <HeroCard
          label="Annuity Factor"
          value={fmt.num(result.annuity_factor, 2)}
          sub="PV of $1/year for life"
          valueClass="text-brand-700"
          big
        />
        <HeroCard
          label="Max Sustainable Withdrawal"
          value={fmt.pct(result.max_sustainable_withdrawal_rate)}
          sub="1 ÷ Annuity Factor"
          valueClass="text-brand-700"
          big
        />
      </div>

      {/* ── Detailed Resources vs Claims table (right after Key Metrics) ────── */}
      <div className="section-card">
        <div className="section-header">
          <span className="section-title">📋 Resources vs. Claims Detail</span>
        </div>
        <div className="px-5 py-4 grid md:grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Resources</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <ResourceRow label="Portfolio (after-tax)" value={res.portfolio_after_tax} />
                <ResourceRow label="Private Assets (net)" value={res.private_assets_net} />
                <ResourceRow label="Social Security (PV)" value={res.social_security_pv} />
                <ResourceRow label="Retirement Income (PV)" value={res.retirement_income_pv} />
                <ResourceRow label="Pension (PV)" value={res.pension_pv} />
                <ResourceRow label="Annuity (PV)" value={res.annuity_pv} />
                <ResourceRow label="Other Income (PV)" value={res.other_income_pv} />
                <ResourceRow label="Future Assets (PV)" value={res.future_assets_pv} />
                <ResourceRow label="Human Capital / Future Savings" value={res.human_capital_pv} />
                {res.liabilities_total > 0 && (
                  <tr>
                    <td className="py-2 pr-4 text-slate-500 italic text-xs">Less: standalone liabilities</td>
                    <td className="py-2 text-right font-mono text-red-600 text-xs">({fmt.dollar(res.liabilities_total)})</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-700">
                  <td className="py-2 font-semibold text-brand-700">Total Resources</td>
                  <td className="py-2 text-right font-semibold font-mono text-brand-700">{fmt.dollar(res.total_resources)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Claims</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {result.claims.spending_goals.map((sg, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4 text-slate-700">{sg.label}</td>
                    <td className="py-2 text-right font-mono text-slate-800">{fmt.dollar(sg.pv)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-700">
                  <td className="py-2 font-semibold text-brand-700">Total Claims</td>
                  <td className="py-2 text-right font-semibold font-mono text-brand-700">{fmt.dollar(result.claims.total_claims)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* ── Stacked bar: Resources vs Claims by category ───────────────────── */}
      <div className="section-card p-5">
          <p className="section-title mb-1">Resources vs. Claims — by category</p>
          <p className="text-xs text-slate-400 mb-3">Present value by major category</p>
          <div className="flex flex-wrap gap-4 mb-3">
            {[
              { color: '#598A7D', label: 'Current investments' },
              { color: '#698D9F', label: 'Expected additions' },
              { color: '#B5603A', label: 'Essential spending' },
              { color: '#CAB688', label: 'Desired spending' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={stackedBarData} margin={{ top: 4, right: 30, left: 30, bottom: 4 }}
              barSize={70}>
              <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} height={0} />
              <YAxis
                tickFormatter={v => v === 0 ? '' : '$' + Math.round(v / 1000) + 'k'}
                tick={{ fontSize: 10, fill: '#939598' }}
                axisLine={false} tickLine={false}
                width={52}
              />
              <Tooltip content={<StackedBarTooltip />} />
              <Bar dataKey="investments" stackId="a" fill="#598A7D" name="Current investments" radius={[0,0,0,0]} />
              <Bar dataKey="additions"   stackId="a" fill="#698D9F" name="Expected additions"  radius={[4,4,0,0]} />
              <Bar dataKey="essential"   stackId="b" fill="#B5603A" name="Essential spending"  radius={[0,0,0,0]} />
              <Bar dataKey="desired"     stackId="b" fill="#CAB688" name="Desired spending"    radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
      </div>

      {/* ── Resources & Claims breakdown ─────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="section-card p-5">
          <p className="section-title mb-1">Resources — {fmt.dollar(res.total_resources)}</p>
          <p className="text-xs text-slate-400 mb-4">After-tax present value of all assets</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={resourcesChartData}
                cx="50%" cy="50%"
                outerRadius={78}
                dataKey="value"
                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                  if (percent < 0.04) return null
                  const RADIAN = Math.PI / 180
                  const r = innerRadius + (outerRadius - innerRadius) * 0.55
                  const x = cx + r * Math.cos(-midAngle * RADIAN)
                  const y = cy + r * Math.sin(-midAngle * RADIAN)
                  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>{`${(percent*100).toFixed(0)}%`}</text>
                }}
                labelLine={false}
              >
                {resourcesChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={v => fmt.dollar(v)} />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="section-card p-5">
          <p className="section-title mb-1">Claims — {fmt.dollar(result.claims.total_claims)}</p>
          <p className="text-xs text-slate-400 mb-4">Actuarial NPV of spending liabilities</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={claimsChartData}
                cx="50%" cy="50%"
                outerRadius={78}
                dataKey="value"
                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                  if (percent < 0.04) return null
                  const RADIAN = Math.PI / 180
                  const r = innerRadius + (outerRadius - innerRadius) * 0.55
                  const x = cx + r * Math.cos(-midAngle * RADIAN)
                  const y = cy + r * Math.sin(-midAngle * RADIAN)
                  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>{`${(percent*100).toFixed(0)}%`}</text>
                }}
                labelLine={false}
              >
                {claimsChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={v => fmt.dollar(v)} />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Sankey ───────────────────────────────────────────────────────── */}
      <div className="section-card p-5">
        <p className="section-title mb-1">Flow: how resources cover claims</p>
        <p className="text-xs text-slate-400 mb-4">Shows which resource categories fund each claim category</p>
        <div className="flex flex-wrap gap-4 mb-4">
          {[
            { color: '#598A7D', label: 'Current investments' },
            { color: '#698D9F', label: 'Expected additions' },
            { color: '#4a7a6e', label: 'Total resources' },
            { color: '#B8A575', label: 'Total claims' },
            { color: '#B5603A', label: 'Essential spending' },
            { color: '#CAB688', label: 'Desired spending' },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
        <SankeyChart data={sankeyData} />
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const STATUS_ICONS = {
  overfunded: '🟢', fully_funded: '✅', at_risk: '🟡', underfunded: '🔴'
}

const CLAIM_COLORS = ['#939598', '#808183', '#CAB688', '#B8A575', '#ABABAC', '#D9C9A3']

function SankeyChart({ data }) {
  const wrapRef   = useRef(null)
  const canvasRef = useRef(null)

  const draw = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const W = wrap.offsetWidth
    if (W < 100) return

    const { accounts = [], additions = [], claims = [] } = data
    if ((!accounts.length && !additions.length) || !claims.length) return

    const PALETTE = {
      invest:    { node: '#598A7D', flow: [89,  138, 125] },  // teal green
      addition:  { node: '#698D9F', flow: [105, 141, 159] },  // steel blue
      essential: { node: '#B5603A', flow: [181,  96,  58] },  // terracotta
      desired:   { node: '#CAB688', flow: [202, 182, 136] },  // warm sand
      liability: { node: '#939598', flow: [147, 149, 152] },  // grey (negative)
      midRes:    '#4a7a6e',                                    // darker teal
      midClm:    '#C97955',                                    // orange
    }
    const fmtM = v => v >= 1e6 ? '$'+(v/1e6).toFixed(2)+'M' : '$'+Math.round(v/1000)+'k'

    const NW    = 16   // node bar width
    const GAP   = 6    // gap between stacked nodes
    const PAD_T = 20
    const PAD_B = 50
    const LBL_L = Math.min(170, W * 0.24)
    const LBL_R = Math.min(160, W * 0.22)
    const MID   = W - LBL_L - LBL_R
    const X0 = LBL_L
    const X1 = LBL_L + MID * 0.35
    const X2 = LBL_L + MID * 0.65
    const X3 = W - LBL_R

    const srcAll   = [...accounts, ...additions]
    // Separate positive sources from liabilities (negative val)
    const srcPositive = srcAll.filter(n => n.val > 0)
    const srcLiab     = srcAll.filter(n => n.val < 0)
    const grossSrc    = srcPositive.reduce((s, n) => s + n.val, 0)
    const netSrc      = srcAll.reduce((s, n) => s + n.val, 0)  // = total_resources
    const totalClm    = claims.reduce((s, n) => s + n.val, 0)
    const GRAND       = Math.max(grossSrc, totalClm)

    const nRows = Math.max(srcAll.length, claims.length)
    const liabExtra = srcLiab.length > 0 ? 70 : 0
    const minRowH = 62
    const H     = Math.max((srcPositive.length + srcLiab.length) * minRowH + PAD_T + PAD_B + 50 + liabExtra, claims.length * minRowH * 1.6 + PAD_T + PAD_B + 50, 400)
    const TRACK = H - PAD_T - PAD_B
    const sc    = v => (v / GRAND) * TRACK

    function stackNodes(items, x, total) {
      const usedH  = sc(total)
      const gaps   = (items.length - 1) * GAP
      const barPx  = Math.max(0, usedH - gaps)
      let   y      = PAD_T + (TRACK - usedH) / 2
      return items.map(n => {
        const h = Math.max(2, (n.val / total) * barPx)
        const node = { ...n, x, y, h }
        y += h + GAP
        return node
      })
    }

    // Stack positive sources using gross total; liabilities separate at bottom
    const srcNodes = stackNodes(srcPositive, X0, grossSrc)
    const clmNodes = stackNodes(claims, X3, totalClm)
    // Mid-bar: Resources bar height matches gross flows so there's no gap
    // The label shows the net amount (after liabilities)
    const midResH  = sc(grossSrc),  midResY = PAD_T + (TRACK - sc(grossSrc)) / 2
    const midClmH  = sc(totalClm),  midClmY = PAD_T + (TRACK - midClmH) / 2
    // Position liability nodes snugly below the last positive source
    let liabNodes = []
    if (srcLiab.length > 0) {
      const lastSrc = srcNodes[srcNodes.length - 1]
      let liabY = lastSrc ? lastSrc.y + lastSrc.h + GAP * 2 : PAD_T + sc(grossSrc) + GAP
      liabNodes = srcLiab.map(n => {
        const h = Math.max(6, Math.min(sc(Math.abs(n.val)), 20))
        const node = { ...n, x: X0, y: liabY, h }
        liabY += h + GAP
        return node
      })
    }

    // Set up canvas
    const canvas = canvasRef.current
    const dpr    = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width  = W * dpr
    canvas.height = H * dpr
    canvas.style.width  = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const isDark  = window.matchMedia('(prefers-color-scheme:dark)').matches
    const textCol = isDark ? '#c8c6bc' : '#2c2c2a'
    const subCol  = isDark ? '#939598' : '#73726c'

    function band(x0, yT0, yB0, x1, yT1, yB1, rgb, alpha) {
      const cx = (x0 + x1) / 2
      ctx.beginPath()
      ctx.moveTo(x0, yT0)
      ctx.bezierCurveTo(cx, yT0, cx, yT1, x1, yT1)
      ctx.lineTo(x1, yB1)
      ctx.bezierCurveTo(cx, yB1, cx, yB0, x0, yB0)
      ctx.closePath()
      ctx.fillStyle   = `rgba(${rgb},${alpha})`
      ctx.fill()
      ctx.strokeStyle = `rgba(${rgb},${Math.min(1, alpha * 2)})`
      ctx.lineWidth   = 0.5
      ctx.stroke()
    }

    function drawRect(x, y, h, color) {
      ctx.fillStyle = color
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(x, y, NW, Math.max(h, 2), 3)
      else ctx.rect(x, y, NW, Math.max(h, 2))
      ctx.fill()
    }

    // Flows: positive sources → midRes (proportional, top-to-bottom)
    let mrOff = 0
    const totalSrcVal = srcNodes.reduce((s, n) => s + Math.abs(n.val), 0) || 1
    srcNodes.forEach(n => {
      const rgb = PALETTE[n.type]?.flow || PALETTE.invest.flow
      const flowH = (Math.abs(n.val) / totalSrcVal) * midResH
      band(n.x + NW, n.y, n.y + n.h, X1, midResY + mrOff, midResY + mrOff + flowH, rgb.join(','), 0.15)
      mrOff += flowH
    })

    // Liability — draw a subtle dashed line from node to mid-bar bottom
    liabNodes.forEach(n => {
      const cy = n.y + n.h / 2
      ctx.save()
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = 'rgba(147,149,152,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(n.x + NW + 2, cy)
      ctx.lineTo(X1, midResY + midResH)
      ctx.stroke()
      ctx.restore()
    })

    // Bridge: midRes → midClm
    band(X1 + NW, midResY, midResY + midResH, X2, midClmY, midClmY + midClmH, '46,74,122', 0.09)

    // Flows: midClm → claims (top-to-bottom, proportional)
    let mcOff = 0
    clmNodes.forEach(n => {
      const rgb = PALETTE[n.type]?.flow || PALETTE.essential.flow
      const fh  = midClmH * (n.val / totalClm)
      band(X2 + NW, midClmY + mcOff, midClmY + mcOff + fh, n.x, n.y, n.y + n.h, rgb.join(','), 0.17)
      mcOff += fh
    })

    // Node bars
    srcNodes.forEach(n => drawRect(n.x, n.y, n.h, PALETTE[n.type]?.node || PALETTE.invest.node))
    liabNodes.forEach(n => drawRect(n.x, n.y, n.h, PALETTE.liability.node))
    clmNodes.forEach(n => drawRect(n.x, n.y, n.h, PALETTE[n.type]?.node || PALETTE.essential.node))
    drawRect(X1, midResY, midResH, PALETTE.midRes)
    drawRect(X2, midClmY, midClmH, PALETTE.midClm)

    // Left labels (positive sources + liabilities)
    ctx.textBaseline = 'middle'
    // Liability labels
    liabNodes.forEach(n => {
      const cy = n.y + n.h / 2
      ctx.fillStyle = PALETTE.liability.node
      ctx.beginPath(); ctx.arc(n.x - 10, cy, 3, 0, Math.PI * 2); ctx.fill()
      ctx.textAlign = 'right'
      ctx.font = `italic 500 11px var(--font-sans,system-ui)`
      ctx.fillStyle = '#939598'
      ctx.fillText(n.label || 'Liabilities', n.x - 16, cy - 6)
      ctx.font = `400 10px var(--font-sans,system-ui)`
      ctx.fillStyle = '#939598'
      ctx.fillText('$-' + fmtM(Math.abs(n.val)).replace('$',''), n.x - 16, cy + 7)
    })
    srcNodes.forEach(n => {
      const cy = n.y + n.h / 2
      ctx.fillStyle = PALETTE[n.type]?.node || PALETTE.invest.node
      ctx.beginPath(); ctx.arc(n.x - 10, cy, 3, 0, Math.PI * 2); ctx.fill()
      ctx.textAlign = 'right'
      ctx.font = `500 11px var(--font-sans,system-ui)`
      ctx.fillStyle = '#1a2744'
      ctx.fillText(n.label, n.x - 16, cy - 6)
      ctx.font = `400 10px var(--font-sans,system-ui)`
      ctx.fillStyle = '#6B7280'
      ctx.fillText(fmtM(n.val), n.x - 16, cy + 7)
    })

    // Right labels — space them out if nodes are close together
    clmNodes.forEach(n => {
      const cy = n.y + n.h / 2
      ctx.fillStyle = PALETTE[n.type]?.node || PALETTE.essential.node
      ctx.beginPath(); ctx.arc(n.x + NW + 10, cy, 3, 0, Math.PI * 2); ctx.fill()
      ctx.textAlign = 'left'
      ctx.font = `500 11px var(--font-sans,system-ui)`
      ctx.fillStyle = '#1a2744'
      ctx.fillText(n.label, n.x + NW + 16, cy - 6)
      ctx.font = `400 10px var(--font-sans,system-ui)`
      ctx.fillStyle = '#6B7280'
      ctx.fillText(fmtM(n.val), n.x + NW + 16, cy + 7)
    })

    // Mid labels
    function midLabel(x, y, h, label, total) {
      if (h < 20) return
      // Draw label to the side of the node, not inside it (nodes are thin)
      ctx.textAlign = 'center'
      ctx.font = `500 10px var(--font-sans,system-ui)`
      ctx.fillStyle = isDark ? '#e8e6df' : '#2c2c2a'
      ctx.fillText(label, x + NW / 2, y + h / 2 - 6)
      ctx.font = `400 9px var(--font-sans,system-ui)`
      ctx.fillStyle = isDark ? '#9e9c95' : '#5c5b56'
      ctx.fillText(fmtM(total), x + NW / 2, y + h / 2 + 7)
    }
    function midLabelSide(x, y, h, label, total, align) {
      // Renders label beside the node bar for better readability
      ctx.textAlign = align === 'left' ? 'right' : 'left'
      const xPos = align === 'left' ? x - 6 : x + NW + 6
      ctx.font = `600 12px var(--font-sans,system-ui)`
      ctx.fillStyle = '#1a2744'
      ctx.fillText(label, xPos, y + h / 2 - 5)
      ctx.font = `400 10px var(--font-sans,system-ui)`
      ctx.fillStyle = '#6B7280'
      ctx.fillText(fmtM(total), xPos, y + h / 2 + 8)
    }
    midLabelSide(X1, midResY, midResH, 'Resources', netSrc, 'left')
    midLabelSide(X2, midClmY, midClmH, 'Claims',    totalClm, 'right')



    // Hover
    const allNd = [
      ...srcNodes,
      ...liabNodes,
      { label:'Total resources', val:netSrc, x:X1, y:midResY, h:midResH },
      { label:'Total claims',    val:totalClm, x:X2, y:midClmY, h:midClmH },
      ...clmNodes,
    ]
    canvas.onmousemove = e => {
      const r  = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      const hit = allNd.find(n => mx >= n.x && mx <= n.x + NW && my >= n.y && my <= n.y + n.h)
      canvas.title = hit ? `${hit.label}: ${fmtM(hit.val)} (${Math.round(hit.val/GRAND*100)}% of total)` : ''
    }
  }, [data])

  useEffect(() => {
    draw()
    const obs = new ResizeObserver(() => draw())
    if (wrapRef.current) obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [draw])

  if ((!data.accounts?.length && !data.additions?.length) || !data.claims?.length) {
    return <p className="text-xs text-slate-400 italic">No data to display.</p>
  }

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}

function BarCategoryLabel({ x, y, width, height, index, value }) {
  if (!value || value <= 0) return null
  const labels = ['Resources', 'Claims']
  return (
    <text x={x + width / 2} y={y + height + 16} textAnchor="middle" fill="#939598" fontSize={12}>
      {labels[index] ?? ''}
    </text>
  )
}

function StackedBarTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  // Only show entries for the hovered stack (Resources = stackId "a", Claims = stackId "b")
  const relevant = payload.filter(p => p.value > 0)
  if (!relevant.length) return null
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e2e5ec', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: '#374151' }}>{label}</p>
      {relevant.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill, display: 'inline-block' }} />
          <span style={{ color: '#6B7280' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: '#374151', marginLeft: 2 }}>{p.value > 0 ? '$' + p.value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : ''}</span>
        </div>
      ))}
    </div>
  )
}

function HeroCard({ label, value, sub, valueClass = 'text-brand-700', borderClass = 'border-slate-200', bgClass = 'bg-white', big }) {
  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} px-5 py-4 shadow-sm`}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`font-display font-bold leading-none ${big ? 'text-4xl' : 'text-2xl'} ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-2">{sub}</p>}
    </div>
  )
}

function ResourceRow({ label, value }) {
  if (!value || value === 0) return null
  return (
    <tr>
      <td className="py-2 pr-4 text-slate-700">{label}</td>
      <td className="py-2 text-right font-mono text-slate-800">{fmt.dollar(value)}</td>
    </tr>
  )
}

function MetricTile({ label, value, desc, valueClass = 'text-brand-700' }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-semibold font-mono ${valueClass}`}>{value}</p>
      {desc && <p className="text-xs text-slate-400 mt-1">{desc}</p>}
    </div>
  )
}

