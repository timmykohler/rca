import { useState, useEffect, useRef } from 'react'
import { useResultsStore } from '../hooks/useResultsStore'
import { fmt } from '../utils/format'

// ── Attribution driver labels & their component keys ─────────────────────────
const DRIVERS = [
  { key: 'portfolio_after_tax',  label: 'Portfolio value',       side: 'resource' },
  { key: 'social_security_pv',   label: 'Social Security PV',    side: 'resource' },
  { key: 'retirement_income_pv', label: 'Retirement income PV',  side: 'resource' },
  { key: 'human_capital_pv',     label: 'Human capital / savings', side: 'resource' },
  { key: 'private_assets_net',   label: 'Private assets (net)',   side: 'resource' },
  { key: 'future_assets_pv',     label: 'Future assets PV',      side: 'resource' },
  { key: 'liabilities_total',    label: 'Liabilities',            side: 'liability' },
  { key: 'total_claims',         label: 'Spending claims',        side: 'claims' },
]

function computeAttribution(from, to) {
  const fc = from.components || {}
  const tc = to.components   || {}
  const fromFr = from.result.funded_ratio_pct
  const toFr   = to.result.funded_ratio_pct
  const fromRes = fc.total_resources || 1
  const fromClm = fc.total_claims    || 1

  return DRIVERS.map(d => {
    const delta = (tc[d.key] || 0) - (fc[d.key] || 0)
    if (Math.abs(delta) < 1) return null

    let frImpact
    if (d.side === 'claims') {
      // Claims increase reduces FR: −delta/old_claims * old_FR
      frImpact = -(delta / fromClm) * fromFr
    } else if (d.side === 'liability') {
      // Liabilities increase reduces resources → reduces FR
      frImpact = -(delta / fromRes) * fromFr
    } else {
      frImpact = (delta / fromRes) * fromFr
    }

    return {
      label:    d.label,
      delta,
      frImpact: parseFloat(frImpact.toFixed(2)),
      positive: frImpact >= 0,
    }
  }).filter(Boolean).sort((a, b) => Math.abs(b.frImpact) - Math.abs(a.frImpact))
}

// ── Mini chart component using Canvas ────────────────────────────────────────
function TrendCanvas({ plans }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || plans.length < 2) return
    const canvas = ref.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const isDark = matchMedia('(prefers-color-scheme:dark)').matches
    const frs    = plans.map(p => p.result.funded_ratio_pct)
    const minFR  = Math.min(...frs) - 8
    const maxFR  = Math.max(...frs) + 8
    const PAD    = { t: 12, b: 24, l: 36, r: 12 }
    const cW = W - PAD.l - PAD.r
    const cH = H - PAD.t - PAD.b
    const xOf = (i) => PAD.l + (i / (plans.length - 1)) * cW
    const yOf = (v) => PAD.t + (1 - (v - minFR) / (maxFR - minFR)) * cH
    const textColor = isDark ? '#9e9c95' : '#5c5b56'
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'

    // 100% reference line
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    const y100 = yOf(100)
    if (y100 > PAD.t && y100 < H - PAD.b) {
      ctx.beginPath(); ctx.moveTo(PAD.l, y100); ctx.lineTo(W - PAD.r, y100); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = textColor; ctx.font = '9px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText('100%', PAD.l - 3, y100 + 3)
    }
    ctx.setLineDash([])

    // Fill area
    ctx.beginPath()
    plans.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(p.result.funded_ratio_pct)) : ctx.lineTo(xOf(i), yOf(p.result.funded_ratio_pct)))
    ctx.lineTo(xOf(plans.length - 1), H - PAD.b)
    ctx.lineTo(xOf(0), H - PAD.b)
    ctx.closePath()
    ctx.fillStyle = 'rgba(89,138,125,0.10)'
    ctx.fill()

    // Line
    ctx.beginPath()
    plans.forEach((p, i) => {
      const x = xOf(i), y = yOf(p.result.funded_ratio_pct)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#598A7D'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.stroke()

    // Points + x labels
    ctx.font = '9px system-ui'; ctx.textAlign = 'center'
    plans.forEach((p, i) => {
      const x = xOf(i), y = yOf(p.result.funded_ratio_pct)
      const fr = p.result.funded_ratio_pct
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = fr >= 100 ? '#598A7D' : '#C97955'
      ctx.fill()
      ctx.strokeStyle = isDark ? '#1e1e1c' : '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = textColor
      ctx.fillText(p.name.split(' — ')[0] || p.name, x, H - PAD.b + 13)
    })

    // Y-axis ticks
    ctx.textAlign = 'right'; ctx.fillStyle = textColor
    for (let v = Math.ceil(minFR / 5) * 5; v <= maxFR; v += 10) {
      const y = yOf(v)
      if (y > PAD.t && y < H - PAD.b) {
        ctx.fillText(v + '%', PAD.l - 4, y + 3)
        ctx.beginPath()
        ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5; ctx.setLineDash([])
        ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke()
      }
    }
  }, [plans])

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}

// ── Waterfall bar using inline SVG ────────────────────────────────────────────
function WaterfallBar({ drivers, fromFr, toFr }) {
  if (!drivers.length) return <p className="text-sm text-slate-400 italic">No significant changes detected.</p>

  const allVals = [fromFr, toFr, ...drivers.map(d => d.frImpact)]
  const minV = Math.min(fromFr, toFr) - 8
  const maxV = Math.max(fromFr, toFr) + 6
  const range = maxV - minV

  const items = [
    { label: 'Starting FR', value: fromFr, type: 'anchor', bottom: 0 },
    ...drivers.map(d => ({ label: d.label, value: Math.abs(d.frImpact), frImpact: d.frImpact, type: d.positive ? 'pos' : 'neg', delta: d.delta })),
    { label: 'Ending FR', value: toFr, type: 'anchor', bottom: 0 },
  ]

  const W = 560, H = 200
  const PAD = { t: 10, b: 28, l: 8, r: 8 }
  const barW = Math.max(28, Math.floor((W - PAD.l - PAD.r) / items.length) - 8)
  const gap  = Math.floor((W - PAD.l - PAD.r - barW * items.length) / (items.length - 1))
  const yOf  = v => PAD.t + (1 - (v - minV) / range) * (H - PAD.t - PAD.b)
  const hOf  = v => (v / range) * (H - PAD.t - PAD.b)

  let running = fromFr
  const bars = items.map((item, i) => {
    const x = PAD.l + i * (barW + gap)
    let barY, barH, color
    if (item.type === 'anchor') {
      const yTop = yOf(item.value); const yBot = yOf(minV)
      barY = yTop; barH = yBot - yTop
      color = '#698D9F'
    } else {
      if (item.frImpact >= 0) {
        barY = yOf(running + item.frImpact)
        barH = hOf(item.frImpact)
        color = '#598A7D'
      } else {
        barY = yOf(running)
        barH = hOf(Math.abs(item.frImpact))
        color = '#C97955'
      }
      running += item.frImpact
    }
    return { ...item, x, barY, barH, color }
  })

  const y100 = yOf(100)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {y100 > PAD.t && y100 < H - PAD.b && (
        <line x1={PAD.l} y1={y100} x2={W - PAD.r} y2={y100} stroke="rgba(0,0,0,0.15)" strokeWidth="1" strokeDasharray="4 3" />
      )}
      {bars.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.barY} width={barW} height={Math.max(2, b.barH)} rx="2" fill={b.color} />
          {b.type !== 'anchor' && (
            <text x={b.x + barW / 2} y={b.frImpact >= 0 ? b.barY - 3 : b.barY + b.barH + 10}
              textAnchor="middle" fontSize="8" fill={b.color} fontFamily="system-ui" fontWeight="500">
              {b.frImpact >= 0 ? '+' : ''}{b.frImpact.toFixed(1)}pp
            </text>
          )}
          {b.type === 'anchor' && (
            <text x={b.x + barW / 2} y={b.barY - 3}
              textAnchor="middle" fontSize="8.5" fill="#698D9F" fontFamily="system-ui" fontWeight="500">
              {b.value.toFixed(1)}%
            </text>
          )}
          <text x={b.x + barW / 2} y={H - PAD.b + 11}
            textAnchor="middle" fontSize="8" fill="#8a8880" fontFamily="system-ui">
            {b.label.length > 14 ? b.label.slice(0, 13) + '…' : b.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const { savedPlans, loadPlan, deleteSavedPlan } = useResultsStore()
  const [fromId, setFromId] = useState('')
  const [toId,   setToId]   = useState('')

  // Auto-select most recent two when plans load
  useEffect(() => {
    if (savedPlans.length >= 2 && !fromId && !toId) {
      setFromId(savedPlans[1].id)
      setToId(savedPlans[0].id)
    }
  }, [savedPlans])

  const sorted = [...savedPlans].sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt))
  const fromPlan = savedPlans.find(p => p.id === fromId)
  const toPlan   = savedPlans.find(p => p.id === toId)
  const canCompare = fromPlan && toPlan && fromId !== toId

  const drivers    = canCompare ? computeAttribution(fromPlan, toPlan) : []
  const frDelta    = canCompare ? toPlan.result.funded_ratio_pct - fromPlan.result.funded_ratio_pct : 0
  const surpDelta  = canCompare ? toPlan.result.surplus_deficit - fromPlan.result.surplus_deficit : 0

  if (savedPlans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <p className="text-4xl mb-4">📂</p>
        <p className="text-sm text-center">No saved plans yet.</p>
        <p className="text-xs text-center mt-1">Evaluate a plan, then click 💾 Save on the Results page to start building history.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-display font-semibold text-brand-700">Funded Ratio History</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track how the funded ratio has changed over time and see what drove each change.
        </p>
      </div>

      {/* ── Trend chart ────────────────────────────────────────────────────── */}
      {sorted.length >= 2 && (
        <div className="section-card p-5">
          <p className="section-title mb-1">Funded ratio over time</p>
          <p className="text-xs text-slate-400 mb-3">Dashed line at 100% — {sorted.length} snapshots</p>
          <div style={{ height: 200 }}>
            <TrendCanvas plans={sorted} />
          </div>
        </div>
      )}

      {/* ── Attribution comparison ─────────────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header">
          <span className="section-title">📊 Attribution — what changed between two snapshots</span>
        </div>
        <div className="px-5 py-4 space-y-4">

          {/* Selectors */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-slate-500">From:</span>
            <select
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
              value={fromId}
              onChange={e => setFromId(e.target.value)}
            >
              <option value="">— Select snapshot —</option>
              {savedPlans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {new Date(p.savedAt).toLocaleDateString()} — FR {p.result.funded_ratio_pct.toFixed(1)}%
                </option>
              ))}
            </select>
            <span className="text-slate-400">→</span>
            <span className="text-sm text-slate-500">To:</span>
            <select
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
              value={toId}
              onChange={e => setToId(e.target.value)}
            >
              <option value="">— Select snapshot —</option>
              {savedPlans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {new Date(p.savedAt).toLocaleDateString()} — FR {p.result.funded_ratio_pct.toFixed(1)}%
                </option>
              ))}
            </select>
          </div>

          {!canCompare && (
            <p className="text-sm text-slate-400 italic">
              {savedPlans.length === 1
                ? 'Save at least two snapshots to compare.'
                : 'Select two different snapshots above to see attribution.'}
            </p>
          )}

          {canCompare && (
            <>
              {/* Summary metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Starting FR',       val: fromPlan.result.funded_ratio_pct.toFixed(1) + '%', color: '' },
                  { label: 'Ending FR',          val: toPlan.result.funded_ratio_pct.toFixed(1) + '%',  color: '' },
                  { label: 'Change in FR',        val: (frDelta >= 0 ? '+' : '') + frDelta.toFixed(1) + 'pp',
                    color: frDelta >= 0 ? 'text-emerald-700' : 'text-red-600' },
                  { label: 'Surplus change',      val: fmt.dollar(surpDelta),
                    color: surpDelta >= 0 ? 'text-emerald-700' : 'text-red-600' },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">{m.label}</p>
                    <p className={`text-lg font-mono font-semibold ${m.color}`}>{m.val}</p>
                  </div>
                ))}
              </div>

              {/* Waterfall */}
              <div>
                <p className="text-xs text-slate-400 mb-2">Waterfall — contribution of each driver to FR change</p>
                <div className="flex gap-3 flex-wrap mb-3">
                  {[
                    { color: '#598A7D', label: 'Resources grew (positive)' },
                    { color: '#C97955', label: 'Resources fell / claims grew (negative)' },
                    { color: '#698D9F', label: 'Starting / ending FR' },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
                <WaterfallBar drivers={drivers} fromFr={fromPlan.result.funded_ratio_pct} toFr={toPlan.result.funded_ratio_pct} />
              </div>

              {/* Attribution table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="label pb-1.5 text-left font-medium">Driver</th>
                    <th className="label pb-1.5 text-right font-medium">FR impact</th>
                    <th className="label pb-1.5 text-right font-medium">$ change</th>
                    <th className="label pb-1.5 text-right font-medium">Direction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drivers.map((d, i) => (
                    <tr key={i}>
                      <td className="py-2 text-slate-600">{d.label}</td>
                      <td className={`py-2 text-right font-mono font-semibold ${d.positive ? 'text-emerald-700' : 'text-red-600'}`}>
                        {d.frImpact >= 0 ? '+' : ''}{d.frImpact.toFixed(1)}pp
                      </td>
                      <td className={`py-2 text-right font-mono ${d.positive ? 'text-emerald-700' : 'text-red-600'}`}>
                        {d.delta >= 0 ? '+' : ''}{fmt.dollar(d.delta)}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium
                          ${d.positive ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                          {d.positive ? '▲ Improved' : '▼ Declined'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {drivers.length === 0 && (
                    <tr><td colSpan={4} className="py-3 text-center text-slate-400 italic text-xs">No material changes detected between these snapshots.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* ── Snapshot library ───────────────────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header">
          <span className="section-title">📂 All saved snapshots ({savedPlans.length})</span>
        </div>
        <div className="px-5 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {['Name', 'Saved', 'Funded Ratio', 'Resources', 'Claims', 'Surplus', ''].map(h =>
                  <th key={h} className="pb-1.5 text-left text-xs font-medium text-neutral-600 pr-4">{h}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {savedPlans.map(p => (
                <tr key={p.id}>
                  <td className="py-2 pr-4 font-medium text-slate-700">{p.name}</td>
                  <td className="py-2 pr-4 text-slate-400 text-xs">{new Date(p.savedAt).toLocaleDateString()}</td>
                  <td className={`py-2 pr-4 font-mono font-semibold ${p.result.funded_ratio_pct >= 100 ? 'text-brand-600' : 'text-red-600'}`}>
                    {p.result.funded_ratio_pct.toFixed(1)}%
                  </td>
                  <td className="py-2 pr-4 font-mono text-slate-600">{fmt.dollar(p.result.resources.total_resources)}</td>
                  <td className="py-2 pr-4 font-mono text-slate-600">{fmt.dollar(p.result.claims.total_claims)}</td>
                  <td className={`py-2 pr-4 font-mono ${p.result.surplus_deficit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmt.dollar(p.result.surplus_deficit)}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-3">
                      <button className="text-xs text-brand-600 hover:underline" onClick={() => loadPlan(p.id)}>Load</button>
                      <button className="text-xs text-red-400 hover:underline" onClick={() => deleteSavedPlan(p.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
