import { useState, useCallback } from 'react'
import { useResultsStore } from '../hooks/useResultsStore'
import { calculateFundedRatio } from '../utils/api'
import { fmt } from '../utils/format'

const DRIVERS = [
  { key:'portfolio_after_tax',   label:'Portfolio value',          side:'resource' },
  { key:'social_security_pv',    label:'Social security PV',       side:'resource' },
  { key:'retirement_income_pv',  label:'Retirement income PV',     side:'resource' },
  { key:'human_capital_pv',      label:'Human capital / savings',  side:'resource' },
  { key:'private_assets_net',    label:'Private assets (net)',      side:'resource' },
  { key:'future_assets_pv',      label:'Future assets PV',         side:'resource' },
  { key:'liabilities_total',     label:'Liabilities',              side:'liability' },
  { key:'total_claims',          label:'Spending claims',           side:'claims'   },
]

const COLORS = ['#598A7D','#698D9F','#C97955','#CAB688','#8DBFB3','#B8A575','#82A4B4','#4a7a6e']

function getComponents(result) {
  const r = result.resources
  return {
    portfolio_after_tax:  r.portfolio_after_tax  || 0,
    private_assets_net:   r.private_assets_net   || 0,
    liabilities_total:    r.liabilities_total     || 0,
    social_security_pv:   r.social_security_pv   || 0,
    retirement_income_pv: (r.retirement_income_pv||0)+(r.pension_pv||0)+(r.annuity_pv||0)+(r.other_income_pv||0),
    future_assets_pv:     r.future_assets_pv      || 0,
    human_capital_pv:     r.human_capital_pv      || 0,
    total_resources:      r.total_resources        || 0,
    total_claims:         result.claims.total_claims || 0,
  }
}

function computeAttribution(from, to) {
  const fc = from.components, tc = to.components
  const fromFr = from.result.funded_ratio_pct
  const fromRes = fc.total_resources || 1
  const fromClm = fc.total_claims    || 1
  return DRIVERS.map(d => {
    const delta = (tc[d.key]||0) - (fc[d.key]||0)
    if (Math.abs(delta) < 1) return null
    let frImpact
    if (d.side === 'claims')    frImpact = -(delta/fromClm)*fromFr
    else if (d.side==='liability') frImpact = -(delta/fromRes)*fromFr
    else                        frImpact = (delta/fromRes)*fromFr
    return { label:d.label, delta, frImpact:parseFloat(frImpact.toFixed(2)), positive:frImpact>=0 }
  }).filter(Boolean).sort((a,b)=>Math.abs(b.frImpact)-Math.abs(a.frImpact))
}

// ── Mini horizontal bar ───────────────────────────────────────────────────────
function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.abs(value)/max*100) : 0
  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <div style={{flex:1,height:8,background:'var(--color-background-secondary)',borderRadius:4,overflow:'hidden'}}>
        <div style={{width:pct+'%',height:'100%',background:color,borderRadius:4}} />
      </div>
    </div>
  )
}

// ── Waterfall SVG ─────────────────────────────────────────────────────────────

// Greedy word-wrap sized to the available bar width. Long single words are
// hard-split so nothing is ever truncated with an ellipsis.
function wrapLabel(text, maxWidthPx, fontSize, maxLines = 3) {
  const charW = fontSize * 0.55            // rough advance width for system-ui
  const maxChars = Math.max(6, Math.floor(maxWidthPx / charW))
  const words = String(text).split(/\s+/)
  const lines = []
  let cur = ''

  for (let w of words) {
    while (w.length > maxChars) {          // word longer than the column
      if (cur) { lines.push(cur); cur = '' }
      lines.push(w.slice(0, maxChars - 1) + '-')
      w = w.slice(maxChars - 1)
    }
    const candidate = cur ? `${cur} ${w}` : w
    if (candidate.length <= maxChars) {
      cur = candidate
    } else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)

  // If it still overflows the line budget, merge the tail rather than dropping it
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1)
    head.push(lines.slice(maxLines - 1).join(' '))
    return head
  }
  return lines
}

function Waterfall({ drivers, fromFr, toFr }) {
  if (!drivers.length) return <p className="text-xs text-slate-400 italic">No material changes detected.</p>
  const items = [
    { label:'Starting FR', value:fromFr, type:'anchor' },
    ...drivers.map(d=>({label:d.label, value:Math.abs(d.frImpact), frImpact:d.frImpact, type:d.positive?'pos':'neg'})),
    { label:'Ending FR',   value:toFr,  type:'anchor' },
  ]

  const LABEL_FS = 8.5
  const LINE_H   = LABEL_FS + 1.5
  const W = 600

  // Provisional geometry so we can measure how many label lines we need,
  // then size the bottom gutter to fit the tallest label. Labels sit on a
  // fixed baseline below the plot — they never float against the bars.
  const PAD_X = { l: 6, r: 6 }
  const provBW = Math.max(24, Math.floor((W - PAD_X.l - PAD_X.r) / items.length) - 6)
  const provGap = items.length > 1
    ? Math.floor((W - PAD_X.l - PAD_X.r - provBW * items.length) / (items.length - 1))
    : 0
  // Labels are centred, so they may spill into the gap on either side.
  const labelBudget = provBW + provGap * 0.8
  const wrapped = items.map(it => wrapLabel(it.label, labelBudget, LABEL_FS))
  const maxLines = Math.max(...wrapped.map(l => l.length))

  const GUTTER = 10 + maxLines * LINE_H       // space reserved under the axis
  const PAD = { t: 16, b: GUTTER, l: PAD_X.l, r: PAD_X.r }
  const PLOT_H = 190                          // height of the bar area itself
  const H = PAD.t + PLOT_H + PAD.b

  // Domain must cover the whole running path, not just the endpoints — a large
  // negative driver can dip below both FR values and would otherwise render a
  // bar that overflows the axis and collides with the labels beneath it.
  const path=[fromFr]
  drivers.reduce((acc,d)=>{const next=acc+d.frImpact;path.push(next);return next},fromFr)
  path.push(toFr)
  const lo=Math.min(...path), hi=Math.max(...path)
  const padV=Math.max(6,(hi-lo)*0.12)
  const minV=lo-padV, maxV=hi+padV, range=(maxV-minV)||1
  const bW=Math.max(24,Math.floor((W-PAD.l-PAD.r)/items.length)-6)
  const gap=items.length>1?Math.floor((W-PAD.l-PAD.r-bW*items.length)/(items.length-1)):0
  const yOf=v=>PAD.t+(1-(v-minV)/range)*PLOT_H
  const hOf=v=>(v/range)*PLOT_H
  const axisY = PAD.t + PLOT_H

  let running=fromFr
  const bars=items.map((item,i)=>{
    const x=PAD.l+i*(bW+gap)
    let barY,barH,color
    if(item.type==='anchor'){barY=yOf(item.value);barH=yOf(minV)-barY;color='#698D9F'}
    else if(item.frImpact>=0){barY=yOf(running+item.frImpact);barH=hOf(item.frImpact);color='#598A7D';running+=item.frImpact}
    else{barY=yOf(running);barH=hOf(Math.abs(item.frImpact));color='#C97955';running+=item.frImpact}
    return{...item,x,barY,barH:Math.max(2,barH),color,lines:wrapped[i]}
  })
  const y100=yOf(100)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}} role="img"
         aria-label="Waterfall of funded ratio impact by driver">
      {y100>PAD.t&&y100<axisY&&<line x1={PAD.l} y1={y100} x2={W-PAD.r} y2={y100} stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeDasharray="4 3"/>}

      {/* Baseline the category labels hang from */}
      <line x1={PAD.l} y1={axisY} x2={W-PAD.r} y2={axisY} stroke="rgba(0,0,0,0.15)" strokeWidth="1"/>

      {bars.map((b,i)=>{
        // Keep the value label inside the plot so it can't collide with the
        // category label gutter below.
        let valueY = b.frImpact>=0 ? b.barY-4 : b.barY+b.barH+LABEL_FS+1
        if (valueY > axisY - 2) valueY = b.barY - 4
        if (valueY < PAD.t + LABEL_FS) valueY = PAD.t + LABEL_FS
        return (
          <g key={i}>
            <rect x={b.x} y={b.barY} width={bW} height={b.barH} rx="2" fill={b.color}/>
            {b.type!=='anchor'&&(
              <text x={b.x+bW/2} y={valueY} textAnchor="middle" fontSize="9" fill={b.color} fontFamily="system-ui" fontWeight="600">
                {b.frImpact>=0?'+':''}{b.frImpact.toFixed(1)}
              </text>
            )}
            {b.type==='anchor'&&(
              <text x={b.x+bW/2} y={b.barY-4} textAnchor="middle" fontSize="9" fill="#698D9F" fontFamily="system-ui" fontWeight="600">
                {b.value.toFixed(1)}%
              </text>
            )}
            <text x={b.x+bW/2} textAnchor="middle" fontSize={LABEL_FS}
                  fill={b.type==='anchor'?'#5c5a54':'#6f6d66'} fontFamily="system-ui"
                  fontWeight={b.type==='anchor'?600:400}>
              {b.lines.map((ln,j)=>(
                <tspan key={j} x={b.x+bW/2} y={axisY + 11 + j*LINE_H}>{ln}</tspan>
              ))}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function MultiScenarioPage() {
  const { savedPlans, planInput, result: currentResult, storeResult } = useResultsStore()
  const [selected, setSelected]   = useState([])   // ids of plans chosen for comparison
  const [fromId,   setFromId]     = useState('')
  const [toId,     setToId]       = useState('')
  const [running,  setRunning]    = useState(false)
  const [scenarios, setScenarios] = useState([])    // [{id, label, result, components}]
  const [error,    setError]      = useState(null)

  // ── Load saved plans as scenarios ─────────────────────────────────────────
  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  async function loadSelected() {
    setRunning(true); setError(null)
    try {
      const entries = savedPlans.filter(p => selected.includes(p.id))
      const loaded = entries.map(e => ({
        id: e.id,
        label: e.name,
        savedAt: e.savedAt,
        result: e.result,
        components: e.components || getComponents(e.result),
      }))
      setScenarios(loaded)
      if (loaded.length >= 2) { setFromId(loaded[0].id); setToId(loaded[loaded.length-1].id) }
    } catch(e) { setError(e.message) }
    finally { setRunning(false) }
  }

  // ── Run sample plans as scenarios ─────────────────────────────────────────
  const SAMPLE_SCENARIOS = [
    { key:'build_single_well_funded',      label:'Build — Single' },
    { key:'transition_single_well_funded', label:'Transition — Single' },
    { key:'distribute_single_well_funded', label:'Distribute — Single' },
  ]

  async function loadSampleProgression() {
    setRunning(true); setError(null)
    try {
      const results = []
      for (const s of SAMPLE_SCENARIOS) {
        const resp = await fetch(`/sample_plans/${s.key}.json`)
        const plan = await resp.json()
        const result = await calculateFundedRatio(plan)
        results.push({ id: s.key, label: s.label, result, components: getComponents(result) })
      }
      setScenarios(results)
      setFromId(results[0].id)
      setToId(results[results.length-1].id)
    } catch(e) { setError('Failed: ' + (e?.response?.data?.detail || e.message)) }
    finally { setRunning(false) }
  }

  const fromScen = scenarios.find(s=>s.id===fromId)
  const toScen   = scenarios.find(s=>s.id===toId)
  const canAttrib = fromScen && toScen && fromId !== toId
  const drivers   = canAttrib ? computeAttribution(fromScen, toScen) : []
  const frDelta   = canAttrib ? toScen.result.funded_ratio_pct - fromScen.result.funded_ratio_pct : 0
  const maxFr     = scenarios.length ? Math.max(...scenarios.map(s=>s.result.funded_ratio_pct)) : 100
  const minFr     = scenarios.length ? Math.min(...scenarios.map(s=>s.result.funded_ratio_pct)) : 0

  return (
    <div className="space-y-5 max-w-5xl">

      <div>
        <h1 className="text-xl font-display font-semibold text-brand-700">Multi-Scenario Attribution</h1>
        <p className="text-sm text-slate-500 mt-1">Load multiple saved plans or sample progressions to compare and attribute changes in funded ratio.</p>
      </div>

      {/* ── Load options ────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* From saved plans */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-title">📂 From saved plans</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            {savedPlans.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No saved plans yet. Evaluate and save plans from the Results page.</p>
            ) : (
              <>
                <p className="text-xs text-slate-500">Select plans to compare:</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {savedPlans.map(p => (
                    <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-colors
                      ${selected.includes(p.id) ? 'border-brand-400 bg-brand-50' : 'border-slate-100 hover:border-slate-200'}`}>
                      <input type="checkbox" checked={selected.includes(p.id)}
                        onChange={()=>toggleSelect(p.id)} className="w-auto h-auto" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">{new Date(p.savedAt).toLocaleDateString()} — FR {p.result.funded_ratio_pct.toFixed(1)}%</p>
                      </div>
                    </label>
                  ))}
                </div>
                <button className="btn-gold text-sm w-full justify-center"
                  onClick={loadSelected} disabled={selected.length < 2 || running}>
                  {running ? '⏳ Loading…' : `Compare ${selected.length} selected plans`}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sample progression */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-title">📊 Sample life-phase progression</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-slate-500">Load 3 example well-funded plans across life phases to see how resources and claims evolve from Build → Transition → Distribute.</p>
            <div className="space-y-2">
              {SAMPLE_SCENARIOS.map(s => (
                <div key={s.key} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                  <span className="w-2 h-2 rounded-full bg-brand-400 flex-shrink-0" />
                  {s.label}
                </div>
              ))}
            </div>
            <button className="btn-gold text-sm w-full justify-center" onClick={loadSampleProgression} disabled={running}>
              {running ? '⏳ Loading…' : '⚡ Load life-phase progression'}
            </button>
            <p className="text-xs text-slate-400">Also try loading the underfunded or overfunded variants from the Import tab.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Loaded scenarios ─────────────────────────────────────────────────── */}
      {scenarios.length > 0 && (
        <>
          {/* Summary comparison table */}
          <div className="section-card">
            <div className="section-header">
              <span className="section-title">📋 Scenario comparison ({scenarios.length} plans)</span>
            </div>
            <div className="px-5 py-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {['','Scenario','Funded Ratio','Surplus','Resources','Claims','FR Bar'].map((h,i) =>
                      <th key={i} className="pb-1.5 text-left text-xs font-medium text-neutral-600 pr-4">{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scenarios.map((s, i) => {
                    const frPct = s.result.funded_ratio_pct
                    const barW  = maxFr > 0 ? frPct/maxFr*100 : 0
                    const frColor = frPct >= 115 ? '#598A7D' : frPct >= 100 ? '#4a9e8a' : frPct >= 85 ? '#d97706' : '#dc2626'
                    return (
                      <tr key={s.id}>
                        <td className="py-2 pr-2">
                          <div style={{width:10,height:10,borderRadius:2,background:COLORS[i%COLORS.length]}} />
                        </td>
                        <td className="py-2 pr-4 font-medium text-slate-700">{s.label}</td>
                        <td className="py-2 pr-4 font-mono font-semibold" style={{color:frColor}}>{frPct.toFixed(1)}%</td>
                        <td className={`py-2 pr-4 font-mono ${s.result.surplus_deficit>=0?'text-emerald-700':'text-red-600'}`}>
                          {fmt.dollar(s.result.surplus_deficit)}
                        </td>
                        <td className="py-2 pr-4 font-mono text-slate-600">{fmt.dollar(s.result.resources.total_resources)}</td>
                        <td className="py-2 pr-4 font-mono text-slate-600">{fmt.dollar(s.result.claims.total_claims)}</td>
                        <td className="py-2 pr-4 w-32">
                          <div style={{height:14,background:'var(--color-background-secondary)',borderRadius:3,overflow:'hidden'}}>
                            <div style={{width:barW+'%',height:'100%',background:COLORS[i%COLORS.length],borderRadius:3}} />
                          </div>
                          <span className="text-xs text-slate-400">{frPct.toFixed(0)}%</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resources breakdown comparison */}
          <div className="section-card">
            <div className="section-header">
              <span className="section-title">💼 Resources breakdown across scenarios</span>
            </div>
            <div className="px-5 py-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-1.5 text-left text-xs font-medium text-neutral-600 pr-4">Component</th>
                    {scenarios.map((s,i) => (
                      <th key={s.id} className="pb-1.5 text-right text-xs font-medium text-neutral-600 pr-4">
                        <span style={{color:COLORS[i%COLORS.length]}}>{s.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DRIVERS.filter(d=>d.side!=='claims').map(d => {
                    const vals = scenarios.map(s=>s.components[d.key]||0)
                    const maxVal = Math.max(...vals)
                    return (
                      <tr key={d.key}>
                        <td className="py-2 pr-4 text-slate-600">{d.label}</td>
                        {vals.map((v,i)=>(
                          <td key={i} className="py-2 pr-4 text-right">
                            <span className="font-mono text-xs text-slate-700">{v>0?fmt.dollar(v):'—'}</span>
                            {v>0&&<MiniBar value={v} max={maxVal} color={COLORS[i%COLORS.length]}/>}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-slate-300">
                    <td className="py-2 pr-4 font-semibold text-slate-700">Total Resources</td>
                    {scenarios.map((s,i)=>(
                      <td key={i} className="py-2 pr-4 text-right font-mono font-semibold" style={{color:COLORS[i%COLORS.length]}}>
                        {fmt.dollar(s.result.resources.total_resources)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-slate-700">Total Claims</td>
                    {scenarios.map((s,i)=>(
                      <td key={i} className="py-2 pr-4 text-right font-mono font-semibold text-slate-600">
                        {fmt.dollar(s.result.claims.total_claims)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Attribution between two selected scenarios */}
          <div className="section-card">
            <div className="section-header">
              <span className="section-title">📊 Attribution — what changed between two scenarios</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-slate-500">From:</span>
                <select className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                  value={fromId} onChange={e=>setFromId(e.target.value)}>
                  {scenarios.map(s=>(
                    <option key={s.id} value={s.id}>{s.label} — FR {s.result.funded_ratio_pct.toFixed(1)}%</option>
                  ))}
                </select>
                <span className="text-slate-400">→</span>
                <span className="text-sm text-slate-500">To:</span>
                <select className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                  value={toId} onChange={e=>setToId(e.target.value)}>
                  {scenarios.map(s=>(
                    <option key={s.id} value={s.id}>{s.label} — FR {s.result.funded_ratio_pct.toFixed(1)}%</option>
                  ))}
                </select>
              </div>

              {canAttrib && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      {label:'From FR', val:fromScen.result.funded_ratio_pct.toFixed(1)+'%', color:''},
                      {label:'To FR',   val:toScen.result.funded_ratio_pct.toFixed(1)+'%',   color:''},
                      {label:'Change',  val:(frDelta>=0?'+':'')+frDelta.toFixed(1)+'pp',
                        color:frDelta>=0?'text-emerald-700':'text-red-600'},
                    ].map(m=>(
                      <div key={m.label} className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-400 mb-1">{m.label}</p>
                        <p className={`text-lg font-mono font-semibold ${m.color}`}>{m.val}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-2">Waterfall — FR impact by driver</p>
                    <div className="flex gap-3 flex-wrap mb-2">
                      {[['#598A7D','Positive (resources grew)'],['#C97955','Negative (claims grew / resources fell)'],['#698D9F','Anchor']].map(([c,l])=>(
                        <span key={l} className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{background:c}}/>
                          {l}
                        </span>
                      ))}
                    </div>
                    <Waterfall drivers={drivers} fromFr={fromScen.result.funded_ratio_pct} toFr={toScen.result.funded_ratio_pct}/>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {['Driver','FR impact','$ change','Direction'].map(h=>
                          <th key={h} className="pb-1.5 text-left text-xs font-medium text-neutral-600 pr-4">{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {drivers.map((d,i)=>(
                        <tr key={i}>
                          <td className="py-1.5 pr-4 text-slate-600">{d.label}</td>
                          <td className={`py-1.5 pr-4 font-mono font-semibold ${d.positive?'text-emerald-700':'text-red-600'}`}>
                            {d.frImpact>=0?'+':''}{d.frImpact.toFixed(1)}pp
                          </td>
                          <td className={`py-1.5 pr-4 font-mono ${d.positive?'text-emerald-700':'text-red-600'}`}>
                            {d.delta>=0?'+':''}{fmt.dollar(d.delta)}
                          </td>
                          <td className="py-1.5">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium
                              ${d.positive?'bg-emerald-50 text-emerald-700':'bg-orange-50 text-orange-700'}`}>
                              {d.positive?'▲ Improved':'▼ Declined'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {drivers.length===0&&(
                        <tr><td colSpan={4} className="py-3 text-center text-slate-400 italic text-xs">No material changes detected.</td></tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
