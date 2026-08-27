import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { calculateFundedRatio } from '../utils/api'
import { useResultsStore } from '../hooks/useResultsStore'
import { fmt } from '../utils/format'

const PHASE_LABELS = { build: 'Build & Grow', transition: 'Transition', distribute: 'Distribute & Deploy' }
const FUNDING_COLORS = {
  underfunded: 'text-red-600 bg-red-50 border-red-200',
  well_funded:  'text-emerald-700 bg-emerald-50 border-emerald-200',
  overfunded:   'text-emerald-700 bg-emerald-50 border-emerald-200',
}

// Sample plans catalog — matches files in /sample_plans/
const SAMPLES = [
  // Build
  { key:'build_single_underfunded',   phase:'build',      funding:'underfunded',  label:'Single — Underfunded',   name:'Marcus Webb, 40' },
  { key:'build_single_well_funded',   phase:'build',      funding:'well_funded',  label:'Single — Well Funded',   name:'Priya Nair, 42' },
  { key:'build_single_overfunded',    phase:'build',      funding:'overfunded',   label:'Single — Overfunded',    name:'Jordan Park, 38' },
  { key:'build_couple_underfunded',   phase:'build',      funding:'underfunded',  label:'Couple — Underfunded',   name:'Darnell & Keisha Thomas, 43/41' },
  { key:'build_couple_well_funded',   phase:'build',      funding:'well_funded',  label:'Couple — Well Funded',   name:'Michael & Sarah Chen, 45/43' },
  { key:'build_couple_overfunded',    phase:'build',      funding:'overfunded',   label:'Couple — Overfunded',    name:'Robert & Amara Okafor, 44/42' },
  // Transition
  { key:'transition_single_underfunded', phase:'transition', funding:'underfunded', label:'Single — Underfunded', name:'Gloria Reyes, 60' },
  { key:'transition_single_well_funded', phase:'transition', funding:'well_funded', label:'Single — Well Funded', name:'Thomas Nakamura, 58' },
  { key:'transition_single_overfunded',  phase:'transition', funding:'overfunded',  label:'Single — Overfunded',  name:'Catherine Walsh, 57' },
  { key:'transition_couple_underfunded', phase:'transition', funding:'underfunded', label:'Couple — Underfunded', name:'Frank & Linda Martinez, 62/59' },
  { key:'transition_couple_well_funded', phase:'transition', funding:'well_funded', label:'Couple — Well Funded', name:'David & Jennifer Kim, 60/58' },
  { key:'transition_couple_overfunded',  phase:'transition', funding:'overfunded',  label:'Couple — Overfunded',  name:'William & Elizabeth Foster, 59/57' },
  // Distribute
  { key:'distribute_single_underfunded', phase:'distribute', funding:'underfunded', label:'Single — Underfunded', name:'Dorothy Evans, 72' },
  { key:'distribute_single_well_funded', phase:'distribute', funding:'well_funded', label:'Single — Well Funded', name:'Harold Bennett, 68' },
  { key:'distribute_single_overfunded',  phase:'distribute', funding:'overfunded',  label:'Single — Overfunded',  name:'Margaret Sullivan, 70' },
  { key:'distribute_couple_underfunded', phase:'distribute', funding:'underfunded', label:'Couple — Underfunded', name:'Eugene & Patricia Jackson, 70/68' },
  { key:'distribute_couple_well_funded', phase:'distribute', funding:'well_funded', label:'Couple — Well Funded', name:'John & Jane Smith, 66/63' },
  { key:'distribute_couple_overfunded',  phase:'distribute', funding:'overfunded',  label:'Couple — Overfunded',  name:'Richard & Barbara Anderson, 68/66' },
]

const PHASES = ['build','transition','distribute']
const PHASE_META = {
  build:      { label:'Build & Grow',         icon:'📈', desc:'Ages 35–50 · 20+ years to retirement · Accumulating assets' },
  transition: { label:'Transition',           icon:'🔄', desc:'Ages 55–62 · Within 5 years of retirement · Optimizing' },
  distribute: { label:'Distribute & Deploy',  icon:'💸', desc:'Ages 65+ · Taking distributions · Managing longevity risk' },
}

export default function JsonImportPage() {
  const navigate = useNavigate()
  const { storeResult } = useResultsStore()
  const fileRef = useRef(null)

  const [loading, setLoading] = useState(null)  // key of plan being loaded
  const [error,   setError]   = useState(null)
  const [preview, setPreview] = useState(null)  // {plan, text} for file upload preview
  const [calculating, setCalculating] = useState(false)

  async function loadSample(key) {
    setLoading(key)
    setError(null)
    try {
      const resp = await fetch(`/sample_plans/${key}.json`)
      if (!resp.ok) throw new Error(`Could not load ${key}.json`)
      const plan = await resp.json()
      // Store the plan and set hydration flag so ManualInputPage picks it up
      storeResult(null, plan)
      sessionStorage.setItem('rca_hydrate_manual', '1')
      navigate('/')
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(null)
    }
  }

  async function runAndNavigate(plan) {
    setCalculating(true)
    try {
      const result = await calculateFundedRatio(plan)
      storeResult(result, plan)
      navigate('/results')
    } catch(e) {
      setError('Calculation failed: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setCalculating(false)
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const plan = JSON.parse(text)
      setPreview({ plan, name: file.name })
    } catch(e) {
      setError('Invalid JSON file: ' + e.message)
    }
  }

  const grouped = PHASES.reduce((acc, ph) => {
    acc[ph] = SAMPLES.filter(s => s.phase === ph)
    return acc
  }, {})

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── File upload ─────────────────────────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header">
          <span className="section-title">📂 Import JSON Plan File</span>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-500">
            Upload any previously exported plan JSON, or one of the sample files from the <code className="bg-slate-100 px-1 rounded text-xs">sample_plans/</code> folder.
          </p>
          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <p className="text-3xl mb-2">📄</p>
            <p className="text-sm font-medium text-slate-600">Drop a JSON plan file here, or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">Accepts .json files exported from this tool</p>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
          </div>

          {preview && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-emerald-800">✓ Loaded: {preview.name}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><span className="text-slate-500">Name: </span><span className="font-medium">{preview.plan.investor_name}</span></div>
                <div><span className="text-slate-500">Age: </span><span className="font-medium">{preview.plan.investor_age}</span></div>
                <div><span className="text-slate-500">Portfolio: </span><span className="font-medium">{fmt.dollar(preview.plan.portfolio_assets?.reduce((s,a)=>s+a.present_value,0)||0)}</span></div>
                <div><span className="text-slate-500">Goals: </span><span className="font-medium">{preview.plan.spending_goals?.length || 0} spending goals</span></div>
              </div>
              <div className="flex gap-2">
                <button className="btn-gold text-sm" onClick={() => runAndNavigate(preview.plan)} disabled={calculating}>
                  {calculating ? '⏳ Calculating…' : '⚡ Evaluate Plan'}
                </button>
                <button className="btn-secondary text-sm" onClick={() => setPreview(null)}>Clear</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Sample plans library ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-display font-semibold text-brand-700 mb-1">Sample Plans Library</h2>
        <p className="text-sm text-slate-500 mb-4">
          18 example plans across all life phases and funding levels. Click any to evaluate instantly.
        </p>

        {PHASES.map(phase => {
          const meta = PHASE_META[phase]
          return (
            <div key={phase} className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg">{meta.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-brand-700">{meta.label}</h3>
                  <p className="text-xs text-slate-400">{meta.desc}</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {grouped[phase].map(s => {
                  const isLoading = loading === s.key
                  const fundingLabel = s.funding === 'underfunded' ? 'Underfunded'
                    : s.funding === 'well_funded' ? 'Well Funded' : 'Overfunded'
                  const fundingColor = s.funding === 'underfunded'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  const isCouple = s.key.includes('couple')

                  return (
                    <button
                      key={s.key}
                      className="section-card p-4 text-left hover:border-brand-400 transition-colors group disabled:opacity-60 w-full"
                      onClick={() => loadSample(s.key)}
                      disabled={!!loading || calculating}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500">
                          {isCouple ? '👫' : '👤'} {isCouple ? 'Couple' : 'Single'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${fundingColor}`}>
                          {fundingLabel}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 group-hover:text-brand-700 transition-colors">
                        {s.name}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">{s.label}</p>
                      <div className="mt-3 text-xs text-brand-600 font-medium group-hover:underline">
                        {isLoading ? '⏳ Loading…' : '📝 Load into Manual Input →'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
